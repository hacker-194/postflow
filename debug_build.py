import re

with open('src/popup/index.tsx', 'rb') as f:
    content = f.read()

# Find line 195
lines = content.split(b'\n')
line195 = lines[194]  # 0-indexed
print(f'Line 195: {line195}')
print(f'Line 195 hex: {line195.hex()}')

# Check for any / characters that might look like regex
# Look for /pattern/ patterns (not preceded by < or followed by >)
matches = re.findall(rb'(?<![<])\/\^?[^\/]+\/(?![>])', line195)
print(f'Regex matches: {matches}')

# Check for template literals with ${}
dollar_braces = re.findall(rb'\$\{[^}]+\}', line195)
print(f'Template dollar braces: {dollar_braces}')

# Print lines 190-200 for context
print("\nContext lines 190-200:")
start = 190
end = min(len(lines), 201)
for i in range(start, end):
    line = lines[i]
    line_num = i + 1
    print(f'Line {line_num}: {line}')