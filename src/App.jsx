import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'flashcards-data'

function loadSavedSet() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY)
    if (storedValue === null) return { cards: [], files: [], review: emptyReview(), error: '' }

    const savedSet = JSON.parse(storedValue)
    const rawCardsAreValid = Array.isArray(savedSet.cards)
      && savedSet.cards.every((card) => (
        card
        && typeof card.front === 'string'
        && typeof card.back === 'string'
        && (typeof card.id === 'number' || typeof card.id === 'string')
      ))
    if (!rawCardsAreValid || !Array.isArray(savedSet.fileNames)
      || !savedSet.fileNames.every((fileName) => typeof fileName === 'string')) {
      return { cards: [], files: [], review: emptyReview(), error: 'Saved flashcards could not be loaded.' }
    }

    const filesAreValid = Array.isArray(savedSet.files)
      && savedSet.files.every((file) => (
        file
        && Number.isInteger(file.id)
        && typeof file.name === 'string'
      ))
    const files = filesAreValid
      ? savedSet.files
      : savedSet.cards.length
        ? [{ id: 0, name: savedSet.fileNames.join(', ') || 'Previously uploaded CSVs' }]
        : []
    const legacyFileId = files[0]?.id
    const cards = savedSet.cards.map((card, index) => ({
      ...card,
      id: index,
      sourceFileId: Number.isInteger(card.sourceFileId) && files.some((file) => file.id === card.sourceFileId)
        ? card.sourceFileId
        : legacyFileId,
    }))
    if (cards.some((card) => !Number.isInteger(card.sourceFileId))) {
      return { cards: [], files: [], review: emptyReview(), error: 'Saved flashcards could not be loaded.' }
    }

    const validIds = new Set(cards.map((card) => card.id))
    const savedReview = savedSet.review
    const isValidReview = savedReview
      && Array.isArray(savedReview.roundIds)
      && savedReview.roundIds.every((id) => validIds.has(id))
      && Array.isArray(savedReview.knownIds)
      && savedReview.knownIds.every((id) => validIds.has(id))
      && Array.isArray(savedReview.unknownIds)
      && savedReview.unknownIds.every((id) => validIds.has(id))
      && Number.isInteger(savedReview.currentIndex)
      && savedReview.currentIndex >= 0
      && savedReview.currentIndex <= savedReview.roundIds.length
      && typeof savedReview.isFlipped === 'boolean'
      && typeof savedReview.isShuffled === 'boolean'
      && Number.isInteger(savedReview.roundNumber)
      && (savedReview.sortHistory === undefined
        || (Array.isArray(savedReview.sortHistory)
          && savedReview.sortHistory.every((entry) => (
            entry
            && validIds.has(entry.cardId)
            && typeof entry.isKnown === 'boolean'
          ))))
      && (savedReview.screen === 'study' || savedReview.screen === 'complete')

    return {
      cards,
      files,
      review: isValidReview
        ? {
          ...savedReview,
          roundIds: savedReview.roundIds.map((id) => savedSet.cards.findIndex((card) => card.id === id)),
          knownIds: savedReview.knownIds.map((id) => savedSet.cards.findIndex((card) => card.id === id)),
          unknownIds: savedReview.unknownIds.map((id) => savedSet.cards.findIndex((card) => card.id === id)),
          sortHistory: (savedReview.sortHistory || []).map((entry) => ({
            ...entry,
            cardId: savedSet.cards.findIndex((card) => card.id === entry.cardId),
          })),
        }
        : emptyReview(),
      error: '',
    }
  } catch {
    return { cards: [], files: [], review: emptyReview(), error: 'Saved flashcards could not be loaded.' }
  }
}

function emptyReview() {
  return {
    roundIds: [],
    knownIds: [],
    unknownIds: [],
    currentIndex: 0,
    isFlipped: false,
    isShuffled: false,
    roundNumber: 1,
    sortHistory: [],
    screen: null,
  }
}

function FittedText({ children }) {
  const textRef = useRef(null)

  useLayoutEffect(() => {
    const element = textRef.current
    if (!element) return undefined

    const fitText = () => {
      let fontSize = 32
      element.style.fontSize = `${fontSize}px`
      while (
        fontSize > 8
        && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
      ) {
        fontSize -= 1
        element.style.fontSize = `${fontSize}px`
      }
    }

    fitText()
    const observer = new ResizeObserver(fitText)
    observer.observe(element.parentElement)
    return () => observer.disconnect()
  }, [children])

  return <span className="card-content" ref={textRef}>{children}</span>
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let closedQuote = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += character
      }
      continue
    }

    if (character === ',' || character === '\n' || character === '\r') {
      row.push(field.trim())
      field = ''
      closedQuote = false

      if (character !== ',') {
        rows.push(row)
        row = []
        if (character === '\r' && text[index + 1] === '\n') index += 1
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0 || closedQuote) {
        throw new Error('Quotation marks must wrap an entire field.')
      }
      quoted = true
      continue
    }

    if (closedQuote && character.trim() !== '') {
      throw new Error('Unexpected text after a quoted field.')
    }

    if (!closedQuote) field += character
  }

  if (quoted) throw new Error('A quoted field is not closed.')
  if (field.length > 0 || row.length > 0 || closedQuote) {
    row.push(field.trim())
    rows.push(row)
  }

  return rows
}

function shuffleCards(cards) {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function App() {
  const [savedSet] = useState(loadSavedSet)
  const [cards, setCards] = useState(savedSet.cards)
  const [uploadedFiles, setUploadedFiles] = useState(savedSet.files)
  const [review, setReview] = useState(savedSet.review)
  const [sortingDirection, setSortingDirection] = useState('')
  const [screen, setScreen] = useState('upload')
  const [error, setError] = useState(savedSet.error)
  const [isReading, setIsReading] = useState(false)

  const saveSet = useCallback((nextCards, nextFiles, nextReview) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cards: nextCards,
        files: nextFiles,
        fileNames: nextFiles.map((file) => file.name),
        review: nextReview,
      }))
    } catch {
      setError('Could not save your flashcards in this browser.')
    }
  }, [])

  const updateReview = useCallback((nextReview) => {
    setReview(nextReview)
    saveSet(cards, uploadedFiles, nextReview)
  }, [cards, uploadedFiles, saveSet])

  const classifyCard = useCallback((isKnown) => {
    if (!review.isFlipped || sortingDirection) return
    setSortingDirection(isKnown ? 'right' : 'left')
  }, [review.isFlipped, sortingDirection])

  const finishSorting = () => {
    if (!sortingDirection) return

    const cardId = review.roundIds[review.currentIndex]
    const nextIndex = review.currentIndex + 1
    const nextReview = {
      ...review,
      knownIds: sortingDirection === 'right' ? [...review.knownIds, cardId] : review.knownIds,
      unknownIds: sortingDirection === 'left' ? [...review.unknownIds, cardId] : review.unknownIds,
      sortHistory: [...review.sortHistory, { cardId, isKnown: sortingDirection === 'right' }],
      currentIndex: nextIndex,
      isFlipped: false,
      screen: nextIndex === review.roundIds.length ? 'complete' : 'study',
    }
    updateReview(nextReview)
    setSortingDirection('')
    if (nextReview.screen === 'complete') {
      setScreen('complete')
    } else {
      setScreen('study')
    }
  }

  useEffect(() => {
    if (screen !== 'study') return undefined

    const handleKeyDown = (event) => {
      const key = event.key
      const shouldFlip = key === ' ' || key === 'ArrowUp' || key === 'ArrowDown'
      const shouldSort = key === 'ArrowLeft' || key === 'ArrowRight'
      if (!shouldFlip && !shouldSort) return

      event.preventDefault()
      if (event.repeat) return
      if (sortingDirection) return

      if (shouldFlip) {
        updateReview({ ...review, isFlipped: !review.isFlipped })
      } else if (review.isFlipped && !sortingDirection) {
        classifyCard(key === 'ArrowRight')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [screen, review, sortingDirection, classifyCard, updateReview])

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    setError('')
    if (!files.length) return

    setIsReading(true)
    try {
      const importedCards = []
      const importedFiles = []
      let nextFileId = uploadedFiles.reduce((maximum, file) => Math.max(maximum, file.id), -1) + 1
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
          throw new Error(`${file.name}: please choose a CSV file.`)
        }

        const content = (await file.text()).replace(/^\uFEFF/, '')
        let rows
        try {
          rows = parseCsv(content)
        } catch (parseError) {
          throw new Error(`${file.name}: ${parseError.message}`)
        }

        if (!rows.length) {
          throw new Error(`${file.name}: the file is empty.`)
        }

        const sourceFileId = nextFileId
        importedFiles.push({ id: sourceFileId, name: file.name })
        rows.forEach((card, rowIndex) => {
          if (card.length !== 2) {
            throw new Error(`${file.name}, row ${rowIndex + 1}: expected exactly 2 fields, found ${card.length}.`)
          }
          importedCards.push({
            front: card[0],
            back: card[1],
            id: cards.length + importedCards.length,
            sourceFileId,
          })
        })
        nextFileId += 1
      }

      const nextCards = [...cards, ...importedCards]
      const nextFiles = [...uploadedFiles, ...importedFiles]
      const nextReview = emptyReview()
      setCards(nextCards)
      setUploadedFiles(nextFiles)
      setReview(nextReview)
      saveSet(nextCards, nextFiles, nextReview)
      setScreen('upload')
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setIsReading(false)
    }
  }

  const removeFile = (fileId) => {
    const remainingCards = cards
      .filter((card) => card.sourceFileId !== fileId)
      .map((card, index) => ({ ...card, id: index }))
    const remainingFiles = uploadedFiles.filter((file) => file.id !== fileId)
    const nextReview = emptyReview()
    setCards(remainingCards)
    setUploadedFiles(remainingFiles)
    setReview(nextReview)
    setSortingDirection('')
    setScreen('upload')
    saveSet(remainingCards, remainingFiles, nextReview)
  }

  const beginRound = (deck, isNewStudy = false, isRetry = false) => {
    if (!deck.length) return
    const roundIds = deck.map((card) => card.id)
    const nextReview = {
      ...review,
      roundIds: review.isShuffled ? shuffleCards(roundIds) : roundIds,
      knownIds: isNewStudy ? [] : review.knownIds,
      unknownIds: isNewStudy || isRetry ? [] : review.unknownIds,
      currentIndex: 0,
      isFlipped: false,
      roundNumber: isNewStudy ? 1 : review.roundNumber + (isRetry ? 1 : 0),
      sortHistory: isNewStudy || isRetry ? [] : review.sortHistory,
      screen: 'study',
    }
    updateReview(nextReview)
    setScreen('study')
  }

  const toggleShuffle = () => {
    const remaining = review.roundIds.slice(review.currentIndex)
    const nextShuffled = !review.isShuffled
    const orderedRemaining = nextShuffled
      ? shuffleCards(remaining)
      : remaining.sort((leftId, rightId) => leftId - rightId)
    updateReview({
      ...review,
      roundIds: [...review.roundIds.slice(0, review.currentIndex), ...orderedRemaining],
      isShuffled: nextShuffled,
    })
  }

  const undoLastSort = () => {
    if (sortingDirection || review.sortHistory.length === 0) return

    const lastSort = review.sortHistory[review.sortHistory.length - 1]
    const nextReview = {
      ...review,
      knownIds: lastSort.isKnown
        ? review.knownIds.filter((id) => id !== lastSort.cardId)
        : review.knownIds,
      unknownIds: lastSort.isKnown
        ? review.unknownIds
        : review.unknownIds.filter((id) => id !== lastSort.cardId),
      sortHistory: review.sortHistory.slice(0, -1),
      currentIndex: Math.max(0, review.currentIndex - 1),
      isFlipped: false,
      screen: 'study',
    }

    updateReview(nextReview)
    setScreen('study')
  }

  const resumeReview = () => {
    if (!review.screen) return
    setScreen(review.screen)
  }

  const currentCard = cards.find((card) => card.id === review.roundIds[review.currentIndex])
  const knownCards = review.knownIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean)
  const unknownCards = review.unknownIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean)

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Flashcards</h1>
        {screen !== 'upload' && (
          <button className="plain-button" type="button" disabled={Boolean(sortingDirection)} onClick={() => setScreen('upload')}>
            Back
          </button>
        )}
      </header>

      <main>
        {screen === 'upload' && (
          <section className="library-view">
            <section className="panel" aria-labelledby="upload-title">
              <h2 id="upload-title">Upload CSV files</h2>
              <p>Each row must have two fields: front, then back.</p>
              <label className="file-picker">
                <span>{isReading ? 'Loading…' : 'Choose CSV files'}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  disabled={isReading}
                  onChange={handleFiles}
                />
              </label>
              {error && <p className="error-message" role="alert">{error}</p>}
            </section>

            <section className="panel set-panel" aria-labelledby="set-title">
              <h2 id="set-title">CSV Files Uploaded</h2>
              {uploadedFiles.length ? (
                <>
                  <ul className="file-list">
                    {uploadedFiles.map((file) => (
                      <li className="uploaded-file" key={file.id}>
                        <span className="uploaded-file-name">{file.name}</span>
                        <button
                          className="remove-file-button"
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => removeFile(file.id)}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {cards.length > 0 && (
                    <div className="study-actions">
                      {review.screen && (
                        <button className="secondary-button" type="button" onClick={resumeReview}>
                          Resume {review.screen === 'complete' ? 'results' : 'study'}
                        </button>
                      )}
                      <button className="primary-button" type="button" onClick={() => beginRound(cards, true)}>
                        Start new study
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p>No CSV files uploaded.</p>
              )}
            </section>
            <section className="panel preview-panel" aria-labelledby="preview-title">
              <h2 id="preview-title">Cards ({cards.length})</h2>
              {cards.length ? (
                <ol className="cards-preview">
                  {cards.map((card, index) => (
                    <li className="preview-card" key={card.id}>
                      <span className="preview-card-number">{index + 1}</span>
                      <div className="preview-card-sides">
                        <p>{card.front}</p>
                        <p>{card.back}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No cards uploaded.</p>
              )}
            </section>
          </section>
        )}

        {screen === 'study' && currentCard && (
          <section className="study-view" aria-label="Flashcard review">
            <div className="progress-row">
              <span>Round {review.roundNumber}</span>
              <span>{review.currentIndex + 1} / {review.roundIds.length}</span>
              <div className="review-tools">
                <button
                  className="shuffle-button"
                  type="button"
                  aria-pressed={review.isShuffled}
                  disabled={Boolean(sortingDirection)}
                  onClick={toggleShuffle}
                >
                  Shuffle: {review.isShuffled ? 'On' : 'Off'}
                </button>
                <button
                  className="undo-button"
                  type="button"
                  disabled={Boolean(sortingDirection) || review.sortHistory.length === 0}
                  onClick={undoLastSort}
                >
                  Undo
                </button>
              </div>
            </div>
            <div
              className={`flashcard-scene${sortingDirection ? ` sorting-${sortingDirection}` : ''}`}
              onAnimationEnd={finishSorting}
            >
              <button
                className={`flashcard${review.isFlipped ? ' is-flipped' : ''}`}
                type="button"
                disabled={Boolean(sortingDirection)}
                aria-label={review.isFlipped ? `Back: ${currentCard?.back}. Activate to see the front.` : `Front: ${currentCard?.front}. Activate to reveal the back.`}
                onClick={() => updateReview({ ...review, isFlipped: !review.isFlipped })}
              >
                <span className="flashcard-face flashcard-front">
                  <FittedText>{currentCard?.front ?? ''}</FittedText>
                </span>
                <span className="flashcard-face flashcard-back">
                  <FittedText>{currentCard?.back ?? ''}</FittedText>
                </span>
              </button>
            </div>
            <div className="progress-row pile-count">
              <span>Don’t know: {unknownCards.length}</span>
              <span>Know: {knownCards.length}</span>
            </div>
            <div className="review-controls">
              <button className="review-button" type="button" disabled={!review.isFlipped || Boolean(sortingDirection)} onClick={() => classifyCard(false)}>
                Don’t know
              </button>
              <button className="review-button" type="button" disabled={!review.isFlipped || Boolean(sortingDirection)} onClick={() => classifyCard(true)}>
                Know
              </button>
            </div>
          </section>
        )}

        {screen === 'complete' && (
          <section className="complete-view">
            <h2>Done</h2>
            <p>Know: {knownCards.length}</p>
            <p>Don’t know: {unknownCards.length}</p>
            <div className="completion-actions">
              {unknownCards.length > 0 && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => beginRound(unknownCards, false, true)}
                >
                  Study don’t know pile ({unknownCards.length})
                </button>
              )}
              <button className="secondary-button" type="button" onClick={() => beginRound(cards, true)}>
                Start over
              </button>
              <button className="plain-button" type="button" onClick={() => setScreen('upload')}>
                Back to cards
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
