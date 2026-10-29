p = 'src/pages/PublicDashboard.tsx'
s = open(p, encoding='utf-8').read()

main_idx = s.index('<main className="flex-1')
freq_idx = s.index('{/* Folder-style frequency browser')
region = s[main_idx:freq_idx]

a_start = region.index('<div className="flex flex-wrap items-center justify-between gap-3 mb-6">')
c_start = region.index('FILTERED ASSIGNMENTS')
c_start = region.rindex('{', 0, c_start)
blockAB = region[a_start:c_start]

c_end = region.index('</main>')
blockC = region[c_start:c_end]

region2 = region[:a_start] + blockC + region[c_end:]

anchor = '{/* Summary strip'
i = region2.index(anchor)
region3 = region2[:i] + blockAB + '\n        ' + region2[i:]

s = s[:main_idx] + region3 + s[freq_idx:]
open(p, 'w', encoding='utf-8').write(s)
print('ok')
