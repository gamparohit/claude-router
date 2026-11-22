# Draws an eval sample from SWE-chat (https://huggingface.co/datasets/SALT-NLP/SWE-chat, gated, odc-by): real prompts typed
# into coding agents, with the work that followed each one. Needs ~/.claude-router/swe-chat/conversations.parquet and duckdb.
# The data and the sample stay outside the repo. usage: .venv/bin/python eval/swechat_sample.py [n_per_group]
import duckdb, json, sys
from pathlib import Path
D = Path.home() / '.claude-router' / 'swe-chat'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 200
c = duckdb.connect(); c.sql("SET memory_limit='4GB'")
if not (D / 'prompts.parquet').exists():
    # Work after each user prompt, up to the next user prompt of the session: tool calls, "Action" tool calls, files touched.
    c.sql(f"""CREATE TABLE spans AS
      WITH r AS (SELECT session_id, turn_number, turn_type, category, file_path, output_tokens,
                 sum((turn_type='user_prompt')::INT) OVER (PARTITION BY session_id ORDER BY turn_number) AS k
                 FROM '{D}/conversations.parquet' WHERE turn_type IN ('user_prompt','tool_use','assistant_response'))
      SELECT session_id, k, min(CASE WHEN turn_type='user_prompt' THEN turn_number END) AS turn_number,
             count(*) FILTER (turn_type='tool_use') AS tools, count(*) FILTER (turn_type='tool_use' AND category='Action') AS actions,
             count(DISTINCT file_path) FILTER (turn_type='tool_use' AND category='Action' AND file_path IS NOT NULL) AS files,
             coalesce(sum(output_tokens),0) AS out_tokens
      FROM r WHERE k > 0 GROUP BY 1, 2""")
    c.sql(f"""COPY (SELECT p.session_id, p.turn_number, p.content, p.word_count, p.is_first_turn, p.language, p.prompt_intent, p.prompt_pushback,
             p.agent, s.tools, s.actions, s.files, s.out_tokens,
             lead(p.prompt_pushback) OVER w AS next_pushback, lead(p.turn_number) OVER w IS NULL AS is_last
      FROM '{D}/conversations.parquet' p JOIN spans s ON s.session_id = p.session_id AND s.turn_number = p.turn_number
      WHERE p.turn_type='user_prompt' WINDOW w AS (PARTITION BY p.session_id ORDER BY p.turn_number)) TO '{D}/prompts.parquet' (FORMAT parquet)""")
# Typed English prompts in Claude Code sessions (its tool calls are recorded reliably), with a known next prompt so the
# work span is complete. Drops injected text: tags, slash commands, bracketed notices, markdown-headed skill bodies.
OK = """agent='Claude Code' AND language='ENGLISH' AND prompt_intent IS NOT NULL AND word_count>0 AND NOT is_last
        AND left(ltrim(content),1) NOT IN ('<','/','[','#') AND content NOT ILIKE 'This session is being continued%' AND content NOT LIKE 'Caveat:%'"""
rows = []
for first in (True, False):  # one prompt per session, picked by a hash so the sample is repeatable
    rows += c.sql(f"""SELECT session_id || '#' || turn_number AS id, content AS text, word_count, is_first_turn, prompt_intent, prompt_pushback,
                 next_pushback, tools, actions, files, out_tokens
          FROM '{D}/prompts.parquet' WHERE {OK} AND is_first_turn = {first}
          QUALIFY row_number() OVER (PARTITION BY session_id ORDER BY hash(turn_number)) = 1
          ORDER BY hash(session_id) LIMIT {N}""").fetchall()
keys = ['id', 'text', 'words', 'first', 'intent', 'pushback', 'next_pushback', 'tools', 'actions', 'files', 'out_tokens']
out = [dict(zip(keys, r)) for r in rows]
json.dump(out, open(D / 'sample.json', 'w'))
print(len(out), 'prompts ->', D / 'sample.json', '| first:', sum(r['first'] for r in out), '| median words:', sorted(r['words'] for r in out)[len(out) // 2])
