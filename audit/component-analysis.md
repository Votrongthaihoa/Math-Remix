# Component analysis — Hethonglab TSA practice

## Evidence boundary

- Direct observation: the redacted semantic tree of the package/part list page.
- Supplied DOM evidence: 16 serialized HTML captures, 15 unique by SHA-256, covering confirmation, the exam room, several question controls and completion/recommendation state.
- Executed-code evidence: component/service bodies extracted from the supplied `index-rqS3kNQ4.js` application variant.
- CSS evidence: exact utility classes from both the captures and reference bundle, matched against `index-IpwJzEAT.css`.
- Unavailable: clean live CDP outerHTML, live computed styles and response bodies because attachment activated the site's protection redirect. No bypass was attempted.

## Component hierarchy

```text
App -> BrowserRouter -> LayoutLab
  -> /lab/tsa/luyen-de -> LuyenDePage / PartListPage
     -> bag grid or PartListRow[] -> ResultModal
  -> /phan-thi-tsa/:id -> PartInterface
     -> ConfirmationStep
     -> renderQuestionByType
        -> SingleChoiceQuestion | MultipleChoiceQuestion | FillInBlankQuestion
        -> DragAndDropQuestion | TrueFalseQuestion | MatchingQuestion
     -> ExamSidebar -> SubmitModal
  -> completion/result state -> recommended practice cards
```

## Verified interaction states

- Confirmation: full-width red **Bắt đầu thi** action.
- Single choice: 32px circular marker with 2px border; unselected capture state is `#E8E8E8`.
- Fill blank: inline text input with a 2px blue bottom border.
- Drag/drop: gray, rounded, `cursor-move` items with native `draggable=true` in the supplied snapshots.
- True/false matrix: 28px circular controls, growing to 32px at the `sm` breakpoint.
- Sidebar: candidate block, timer, question navigation and red **Nộp bài** action.

The captures do not contain reliable viewport dimensions. They prove responsive `sm/md/lg` rules, not whether a particular serialization was desktop, tablet or mobile. The selected-answer blue `#1980FF` is verified from the bundle, while the supplied question captures show unselected markers.

## State and behavior

`PartListPage` owns search, 500ms debouncing, tags, topic/status filters, page, bag/part mode, selected bag, loading/error, result-modal state and pagination. Selecting a bag fetches `/bags/:id`; **Vào làm** posts to `/parts/:id/start` and navigates to `/phan-thi-tsa/:attempt.id`.

`flattenQuestions` preserves reading passages as non-numbered structural rows and assigns sequential display indexes to child questions. `renderQuestionByType` dispatches the six verified interactive types. The sidebar excludes passage rows from the total, uses a 480px width from the `md` breakpoint and opens `SubmitModal`.
