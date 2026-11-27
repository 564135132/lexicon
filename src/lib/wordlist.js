// 常用词表加载器：拼写建议和词形还原共用。
// 词表来自 FrequencyWords 的 en_50k（MIT 许可），按词频排序。

const WORD_LIST_URL = '/words/en-50k.txt'
let wordListPromise = null

export function loadCommonWords() {
  if (!wordListPromise) {
    wordListPromise = fetch(WORD_LIST_URL)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => new Set(text.split('\n').map((line) => line.trim()).filter(Boolean)))
      .catch(() => new Set())
  }
  return wordListPromise
}

export function warmUpWordList() {
  void loadCommonWords()
}
