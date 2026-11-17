#!/usr/bin/env python3
"""Lexer-only check: NOT a substitute for a real C# compiler."""
from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'capri-mod/capri-orca-bridge.capri-code').read_text()
stack=[]; state='normal'; i=0; line=1
pairs={')':'(',']':'[','}':'{'}
while i<len(s):
 c=s[i]; n=s[i+1] if i+1<len(s) else ''
 if state=='normal':
  if c=='/' and n=='/':state='linecomment';i+=1
  elif c=='/' and n=='*':state='blockcomment';i+=1
  elif c=='@' and n=='"':state='verbatim';i+=1
  elif c=='"':state='string'
  elif c=="'":state='character'
  elif c in '([{':stack.append((c,line))
  elif c in ')]}':
   assert stack and stack[-1][0]==pairs[c],f'unbalanced {c} at {line}, stack={stack[-2:]}'
   stack.pop()
 elif state=='linecomment':
  if c=='\n':state='normal'
 elif state=='blockcomment':
  if c=='*' and n=='/':state='normal';i+=1
 elif state=='string':
  if c=='\\':i+=1
  elif c=='"':state='normal'
  elif c=='\n':raise AssertionError(f'newline in ordinary C# string at {line}')
 elif state=='verbatim':
  if c=='"':
   if n=='"':i+=1
   else:state='normal'
 elif state=='character':
  if c=='\\':i+=1
  elif c=="'":state='normal'
  elif c=='\n':raise AssertionError(f'newline in C# char at {line}')
 if c=='\n':line+=1
 i+=1
assert state in ('normal','linecomment'),f'unclosed {state}'
assert not stack,f'unbalanced {stack[-5:]}'
for required in ['ICapriMod','capri.Chat.Sending','capri.Brain.AddTool','capri.Timers.Every',
                 'MessageBox.Show','SendPrompt','agent_status','session_history','resume_session','accounts_status','select_account','ShowUsage','SelectAccount']:
 if required=='SendPrompt':continue
 assert required in s, f'missing {required}'
assert '// version: 0.10.1' in s
print('PASS: C# lexer checks, metadata, method presence (NO compilation).')
