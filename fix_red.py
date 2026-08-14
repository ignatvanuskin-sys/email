import pathlib
p = pathlib.Path('src/app/leads/[id]/page.tsx')
text = p.read_text()
# Replace var(--red) with rgb to avoid PS parsing issues
text = text.replace('borderColor: \"var(--red)\", color: \"var(--red)\"', 'borderColor: \"#ff4444\", color: \"#ff4444\"')
p.write_text(text)
print('fixed')
