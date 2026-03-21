# P10 — Format Enforcement

**Použití:** Přidává se na konec každého user message jako instrukce formátu odpovědi.

## Formáty per typ otázky

### yes_no
```
Otázka: {{question_text}}

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": "Ano"} nebo {"answer": "Ne"}
```

### single_choice
```
Otázka: {{question_text}}
Možnosti: {{options_list}}

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": "<jedna z možností výše, přesně jak je napsána>"}
```

### multi_choice
```
Otázka: {{question_text}}
Možnosti: {{options_list}}

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": ["<možnost1>", "<možnost2>"]}
Vyber 1 až {{max_choices}} možností.
```

### likert
```
Otázka: {{question_text}}
Stupnice: {{scale_min}} ({{scale_min_label}}) až {{scale_max}} ({{scale_max_label}})

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": <číslo od {{scale_min}} do {{scale_max}}>}
```

### number
```
Otázka: {{question_text}}
{{#if scale_min}}Rozsah: {{scale_min}}–{{scale_max}}{{/if}}

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": <číslo>}
```

### open_text
```
Otázka: {{question_text}}

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": "<tvoje odpověď v češtině, 1–3 věty>"}
```

### nps
```
Otázka: {{question_text}}
Stupnice: 0 (vůbec nedoporučuji) až 10 (rozhodně doporučuji)

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": <číslo od 0 do 10>}
```

### ranking
```
Otázka: {{question_text}}
Položky k seřazení: {{options_list}}

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": ["<1. místo>", "<2. místo>", ...]}
Seřaď všechny položky od nejdůležitější po nejméně důležitou.
```

### semantic_diff
```
Otázka: {{question_text}}
Stupnice: {{scale_min}} ({{scale_min_label}}) až {{scale_max}} ({{scale_max_label}})

Odpověz POUZE tímto JSON objektem (bez dalšího textu):
{"answer": <číslo od {{scale_min}} do {{scale_max}}>}
```

## Poznámky

- Instrukce "bez dalšího textu" a "POUZE" jsou klíčové — zabraňují markdown/prose wrapping
- OpenAI `response_format: { type: "json_object" }` přidává další vrstvu vynucení
- Options list pro single/multi choice: možnosti jsou randomizovány (Fisher-Yates) před vložením do promptu
