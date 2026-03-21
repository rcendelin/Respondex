import { describe, it, expect } from 'vitest'
import { buildPrompt, isRefusal } from '../prompt-builder.js'
import { Gender, Education, Region, Strategy, QuestionType } from '@respondex/shared'
import type { Person, Question } from '@respondex/shared'

const minimalPerson: Person = {
  id: 'P001',
  age: 35,
  gender: Gender.MALE,
}

const fullPerson: Person = {
  id: 'P002',
  age: 52,
  gender: Gender.FEMALE,
  demographics: {
    education: Education.UNIVERSITY,
    region: Region.PRAGUE,
  },
  life_story: 'Celý život pracuji jako lékařka. Mám dvě děti.',
}

const yesNoQuestion: Question = {
  id: 'Q01',
  order: 1,
  text: 'Hlasoval/a jste v posledních volbách?',
  type: QuestionType.YES_NO,
  required: true,
}

const likertQuestion: Question = {
  id: 'Q02',
  order: 2,
  text: 'Jak jste spokojen/a se svým životem?',
  type: QuestionType.LIKERT,
  required: true,
  scale_min: 1,
  scale_max: 5,
  scale_min_label: 'velmi nespokojen',
  scale_max_label: 'velmi spokojen',
}

const singleChoiceQuestion: Question = {
  id: 'Q03',
  order: 3,
  text: 'Co je pro vás nejdůležitější?',
  type: QuestionType.SINGLE_CHOICE,
  required: true,
  options: ['Ekonomika', 'Zdravotnictví', 'Vzdělání'],
}

describe('buildPrompt', () => {
  it('includes system prompt for strategy A', () => {
    const { system } = buildPrompt(minimalPerson, yesNoQuestion, Strategy.A)
    expect(system).toContain('simulátor lidského respondenta')
    expect(system).toContain('POUZE česky')
  })

  it('includes age and gender in user prompt', () => {
    const { user } = buildPrompt(minimalPerson, yesNoQuestion, Strategy.A)
    expect(user).toContain('35 let')
    expect(user).toContain('Muž')
  })

  it('includes education label (not enum value) in user prompt', () => {
    const { user } = buildPrompt(fullPerson, yesNoQuestion, Strategy.A)
    expect(user).toContain('Vysokoškolské')
    expect(user).not.toContain('university')
  })

  it('includes yes_no format instruction', () => {
    const { user } = buildPrompt(minimalPerson, yesNoQuestion, Strategy.A)
    expect(user).toContain('"answer": "Ano"')
    expect(user).toContain('"answer": "Ne"')
  })

  it('includes scale in likert format instruction', () => {
    const { user } = buildPrompt(minimalPerson, likertQuestion, Strategy.A)
    expect(user).toContain('1')
    expect(user).toContain('5')
    expect(user).toContain('velmi nespokojen')
  })

  it('includes options in single_choice format instruction', () => {
    const { user } = buildPrompt(minimalPerson, singleChoiceQuestion, Strategy.A)
    expect(user).toContain('Ekonomika')
    expect(user).toContain('Zdravotnictví')
  })

  it('strategy C with life_story includes narrative block', () => {
    const { user } = buildPrompt(fullPerson, yesNoQuestion, Strategy.C)
    expect(user).toContain('OSOBNÍ PŘÍBĚH')
    expect(user).toContain('Celý život pracuji jako lékařka')
  })

  it('strategy C without life_story falls back to persona-only', () => {
    const { user } = buildPrompt(minimalPerson, yesNoQuestion, Strategy.C)
    expect(user).not.toContain('OSOBNÍ PŘÍBĚH')
    expect(user).toContain('PROFIL RESPONDENTA')
  })
})

describe('isRefusal', () => {
  it('detects Czech AI refusal patterns', () => {
    expect(isRefusal('Jako AI nemohu odpovědět na tuto otázku.')).toBe(true)
    expect(isRefusal('Odmítám tuto otázku zodpovědět.')).toBe(true)
    expect(isRefusal('Není vhodné odpovídat na takovéto otázky.')).toBe(true)
  })

  it('detects English AI refusal patterns', () => {
    expect(isRefusal("As an AI, I cannot answer this.")).toBe(true)
    expect(isRefusal("I can't help with that.")).toBe(true)
    expect(isRefusal('This would be inappropriate.')).toBe(true)
  })

  it('does not flag normal JSON responses', () => {
    expect(isRefusal('{"answer": "Ano"}')).toBe(false)
    expect(isRefusal('{"answer": 3}')).toBe(false)
    expect(isRefusal('{"answer": "Ekonomika"}')).toBe(false)
  })
})
