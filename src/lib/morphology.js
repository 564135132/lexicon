// 词形还原：把 "went"、"mice"、"studies" 这类变形还原成词条原形。
// 规则只给出候选，最终由词典接口验证原形是否存在（见 dictionary.js 的 lookupWord）。

const IRREGULAR_FORMS = {
  // 不规则动词
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', does: 'do', did: 'do', done: 'do',
  being: 'be', going: 'go', doing: 'do',
  went: 'go', gone: 'go', said: 'say', made: 'make', took: 'take', taken: 'take',
  came: 'come', saw: 'see', seen: 'see', knew: 'know', known: 'know', got: 'get',
  gotten: 'get', gave: 'give', given: 'give', found: 'find', thought: 'think',
  told: 'tell', left: 'leave', felt: 'feel', brought: 'bring', began: 'begin',
  begun: 'begin', kept: 'keep', held: 'hold', wrote: 'write', written: 'write',
  stood: 'stand', heard: 'hear', meant: 'mean', met: 'meet', ran: 'run',
  paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak', led: 'lead',
  grew: 'grow', grown: 'grow', lost: 'lose', fell: 'fall', fallen: 'fall',
  sent: 'send', built: 'build', understood: 'understand', drew: 'draw',
  drawn: 'draw', broke: 'break', broken: 'break', spent: 'spend', rose: 'rise',
  risen: 'rise', drove: 'drive', driven: 'drive', bought: 'buy', wore: 'wear',
  worn: 'wear', chose: 'choose', chosen: 'choose', ate: 'eat', eaten: 'eat',
  threw: 'throw', thrown: 'throw', caught: 'catch', taught: 'teach',
  fought: 'fight', slept: 'sleep', drank: 'drink', drunk: 'drink', swam: 'swim',
  swum: 'swim', sang: 'sing', sung: 'sing', rang: 'ring', rung: 'ring',
  forgot: 'forget', forgotten: 'forget', hid: 'hide', hidden: 'hide',
  bit: 'bite', bitten: 'bite', blew: 'blow', blown: 'blow', flew: 'fly',
  flown: 'fly', shook: 'shake', shaken: 'shake', woke: 'wake', woken: 'wake',
  tore: 'tear', torn: 'tear', swore: 'swear', sworn: 'swear', bore: 'bear',
  borne: 'bear', rode: 'ride', ridden: 'ride', shone: 'shine', sank: 'sink',
  sunk: 'sink', struck: 'strike', swept: 'sweep', wept: 'weep', crept: 'creep',
  dealt: 'deal', dreamt: 'dream', knelt: 'kneel', leapt: 'leap',
  learnt: 'learn', spelt: 'spell', spoilt: 'spoil', burnt: 'burn',
  arose: 'arise', arisen: 'arise', awoke: 'awake', awoken: 'awake',

  // 不规则复数
  children: 'child', men: 'man', women: 'woman', people: 'person',
  mice: 'mouse', feet: 'foot', teeth: 'tooth', geese: 'goose', oxen: 'ox',
  lice: 'louse', dice: 'die',
  analyses: 'analysis', crises: 'crisis', theses: 'thesis',
  phenomena: 'phenomenon', criteria: 'criterion', data: 'datum',
  media: 'medium', alumni: 'alumnus', cacti: 'cactus', fungi: 'fungus',
  nuclei: 'nucleus', radii: 'radius', stimuli: 'stimulus', indices: 'index',
  matrices: 'matrix', vertices: 'vertex', appendices: 'appendix',
  bacteria: 'bacterium', curricula: 'curriculum', memoranda: 'memorandum',
  algae: 'alga', larvae: 'larva', formulae: 'formula', vertebrae: 'vertebra',

  // 不规则比较级 / 最高级
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  further: 'far', farther: 'far', elder: 'old', eldest: 'old',
  less: 'little', more: 'much', most: 'much', fewer: 'few', fewest: 'few',
}

// 本身就以 s 结尾、但不是复数的常见词，避免被 -s 规则误判。
const NON_INFLECTED = new Set([
  'news', 'series', 'species', 'means', 'thanks', 'always', 'perhaps', 'sometimes',
  'towards', 'afterwards', 'upstairs', 'downstairs', 'outdoors', 'indoors', 'maths',
  'physics', 'politics', 'economics', 'ethics', 'athletics', 'gymnastics',
])

function isConsonant(char) {
  return /[b-df-hj-np-tv-z]/.test(char)
}

export function candidateLemmas(word) {
  const value = String(word ?? '').trim().toLowerCase()
  if (!/^[a-z]+$/.test(value)) return []
  if (NON_INFLECTED.has(value)) return []

  const candidates = []
  const push = (candidate) => {
    if (!candidate || candidate === value || candidate.length < 2) return
    if (!/^[a-z]+$/.test(candidate) || candidates.includes(candidate)) return
    candidates.push(candidate)
  }

  push(IRREGULAR_FORMS[value])

  // 复数：studies → study，boxes → box，wolves → wolf / knife
  if (value.endsWith('ies') && value.length > 4) push(value.slice(0, -3) + 'y')
  if (value.endsWith('ves') && value.length > 4) {
    push(value.slice(0, -3) + 'f')
    push(value.slice(0, -3) + 'fe')
  }
  if (/(?:s|x|z|ch|sh)es$/.test(value) && value.length > 4) push(value.slice(0, -2))

  // 第三人称单数：runs → run；避免 news / series / bus 这类本身以 s 结尾的词
  if (value.endsWith('s') && value.length > 3 && !/(?:ss|us|is|ous|ics)$/.test(value)) {
    push(value.slice(0, -1))
  }

  // 过去式 / 过去分词：tried → try，stopped → stop，loved → love
  if (value.endsWith('ied') && value.length > 4) push(value.slice(0, -3) + 'y')
  if (value.endsWith('ed') && value.length > 3) {
    const stem = value.slice(0, -2)
    push(stem)
    if (stem.length > 2 && isConsonant(stem[stem.length - 1]) && stem[stem.length - 1] === stem[stem.length - 2]) {
      push(stem.slice(0, -1))
    }
    push(value.slice(0, -1))
  }

  // 现在分词：running → run，making → make，lying → lie
  if (value.endsWith('ing') && value.length > 4) {
    const stem = value.slice(0, -3)
    if (stem.endsWith('y') && stem.length <= 3) {
      // lying / dying / tying 的 -ie 形式
      push(stem.slice(0, -1) + 'ie')
    } else if (stem.length >= 3) {
      push(stem)
      if (isConsonant(stem[stem.length - 1]) && stem[stem.length - 1] === stem[stem.length - 2]) {
        push(stem.slice(0, -1))
      }
      push(stem + 'e')
    }
  }

  return candidates
}

// 规则给出的候选里可能混着 "stopp" 这类无效拼写。
// 用常用词表把确实存在的词排到前面，减少无效的词典请求。
export function orderLemmas(candidates, isKnown) {
  const known = []
  const unknown = []
  for (const candidate of candidates) {
    if (isKnown(candidate)) known.push(candidate)
    else unknown.push(candidate)
  }
  return [...known, ...unknown]
}
