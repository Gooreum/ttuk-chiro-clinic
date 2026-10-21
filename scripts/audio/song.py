# 뚝 카이로 클리닉 배경음 악보 (Claude가 직접 작곡, 2026-10-21)
# 병맛 진료실: 통통 튀는 스타카토 멜로디, 오쿰파(베이스 정박 + 화음 뒷박), 반음 꾸밈.
# 구조 48마디 = intro 4 + A 8 + B 8 + A' 8 + C(Ab조로 튐) 8 + A'' 8 + link 4, 100 BPM 약 115초, 끝이 처음으로 이어진다.
# 표기: 마디는 |, 음은 "이름 박수"(r = 쉼), 마디마다 4박. 코드는 마디당 1~2개.

BPM = 100

INTRO = dict(
    chords="C | Am | F | G7",
    lead="""r 2 G4 .5 C5 .5 E5 1 | r 2 A4 .5 C5 .5 E5 1 | r 2 A4 .5 C5 .5 F5 1 |
            G5 .5 F5 .5 D5 .5 B4 .5 G4 1 r 1""")

A = dict(
    chords="C | A7 | Dm | G7 | C | A7 | Dm G7 | C",
    lead="""E5 .5 r .5 G5 .5 r .5 C6 .5 B5 .5 A5 .5 G5 .5 | C#5 .5 r .5 E5 .5 G5 .5 A5 1 r 1 |
            F5 .5 r .5 A5 .5 r .5 D6 .5 C6 .5 A5 .5 F5 .5 | G5 1 F5 .5 D5 .5 B4 1 r 1 |
            E5 .5 r .5 G5 .5 r .5 C6 .5 D6 .5 E6 .5 C6 .5 | C#6 .5 r .5 A5 .5 r .5 E5 .5 G5 .5 Bb5 .5 A5 .5 |
            F5 .5 A5 .5 D6 .5 C6 .5 B5 .5 G5 .5 F5 .5 D5 .5 | C5 1 G4 .5 C5 .5 r 2""")

B = dict(
    chords="F | Fm | C | A7 | Dm | G7 | Em A7 | Dm G7",
    lead="""A5 1.5 G5 .5 F5 1 C5 1 | Ab5 1.5 G5 .5 F5 1 C5 1 | G5 .5 E5 .5 C5 .5 E5 .5 G5 1 C6 1 |
            Bb5 1 A5 .5 G5 .5 E5 1 C#5 1 | D5 .5 F5 .5 A5 .5 D6 .5 C6 1 A5 1 | B5 .5 r .5 B5 .5 C6 .5 D6 1 B5 1 |
            G5 .5 E5 .5 B4 .5 E5 .5 G5 .5 E5 .5 C#5 .5 A4 .5 | F5 1 A5 1 G5 .5 F5 .5 D5 .5 B4 .5""")

C = dict(
    chords="Ab | Bb | Gm | Cm | Fm | Bb7 | Eb | G7",
    lead="""C6 .5 r .5 Eb5 .5 r .5 Ab5 1 C6 1 | D6 .5 r .5 F5 .5 r .5 Bb5 1 D6 1 | D6 .5 Bb5 .5 G5 .5 D5 .5 G5 2 |
            Eb6 .5 D6 .5 C6 .5 G5 .5 Eb5 2 | F5 .5 Ab5 .5 C6 .5 F6 .5 Eb6 1 C6 1 | D6 .5 C6 .5 Bb5 .5 Ab5 .5 F5 1 D5 1 |
            Eb5 .5 G5 .5 Bb5 .5 Eb6 .5 D6 .5 Bb5 .5 G5 .5 Eb5 .5 | D5 .5 F5 .5 G5 .5 B5 .5 D6 1 r 1""")

LINK = dict(
    chords="F | G7 | C | G7",
    lead="""A5 1 F5 1 C5 1 F5 1 | G5 1 D5 1 B4 1 D5 1 | C5 .5 E5 .5 G5 .5 C6 .5 r 2 |
            G4 .5 B4 .5 D5 .5 F5 .5 G5 .5 r .5 B4 .5 D5 .5""")

# 구간마다: 악보, 베이스 패턴, 반주 패턴, 드럼, 추가 성부
#   bass: oompah(정박 근음·5음) / walk(4분 걷기) / whole(온음)
#   comp: offbeat(뒷박 스타카토 화음) / arp(8분 분산) / none
#   drums: hats / light / pop / half
#   extra: double(한 옥타브 아래 교대) / counter(긴 대선율) / third(3도 아래 화음) / turns(긴 음 꾸밈)
SECTIONS = [
    dict(name="intro", **INTRO, bass="whole", comp="arp", drums="hats", extra=[]),
    dict(name="A", **A, bass="oompah", comp="offbeat", drums="light", extra=[]),
    dict(name="B", **B, bass="walk", comp="arp", drums="pop", extra=["counter"]),
    dict(name="A'", **A, bass="walk", comp="offbeat", drums="pop", extra=["double", "counter"]),
    dict(name="C", **C, bass="oompah", comp="arp", drums="half", extra=["counter"]),
    dict(name="A''", **A, bass="oompah", comp="offbeat", drums="pop", extra=["third", "turns"]),
    dict(name="link", **LINK, bass="oompah", comp="offbeat", drums="light", extra=[]),
]
