import pathlib
p = pathlib.Path('src/app/leads/[id]/page.tsx')
t = p.read_text()
t = t.replace('  tags: Array<{ id: string; name: string; color: string };\n', '')
t = t.replace('  opportunity: { id: string; stage: string; valueNote: string } | null;\n', '')
t = t.replace('    await load();\n\n  if', '    await load();\n  });\n\n  if')
p.write_text(t)
print('ok')
