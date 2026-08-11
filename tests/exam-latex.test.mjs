import assert from "node:assert/strict";
import test from "node:test";
import { formatLatexAnswerForDisplay, LATEX_TABLE_ALIGN_END, LATEX_TABLE_ALIGN_START, LATEX_TABLE_COLSPAN_END, LATEX_TABLE_COLSPAN_START, LATEX_TABLE_ROWSPAN_END, LATEX_TABLE_ROWSPAN_START, matchingError, normalizeLatexContent, parseBaidocDocument, parseBaidocQuestionEntries, parseLatexQuestion, splitLatexQuestions } from "../lib/exam-latex.ts";

test("keeps phan markers on the first ex of each part", () => {
  const source = String.raw`\phan1
\begin{ex}
Question one
\choice{\True A}{B}
\end{ex}
\begin{ex}
Question two
\choice{A}{\True B}
\end{ex}
\phan2
\begin{ex}
Question three
\choice{\True A}{B}
\end{ex}`;
  const blocks = splitLatexQuestions(source);
  assert.equal(blocks.length, 3);
  assert.match(blocks[0], /^\\phan1/);
  assert.match(blocks[2], /^\\phan2/);
  assert.deepEqual(blocks.map(block => parseLatexQuestion(block).part), [1, undefined, 2]);
});

test("parses the standard ex choice[2] sample with True and loigiai", () => {
  const source = String.raw`\begin{baidoc}
\begin{ex}
Nghiệm của phương trình $\log_3(x-1)=1$ là
\choice[2]
{$x=5$}
{$x=3$}
{$x=2$}
{\True $x=4$}
\loigiai{
Điều kiện xác định: $x-1>0\Leftrightarrow x>1$.\\
Ta có $\log_3(x-1)=1\Leftrightarrow x-1=3\Leftrightarrow x=4$.\\
Vậy nghiệm của phương trình là $x=4$.
}
\end{ex}
\begin{ex}
Cho hình lập phương $ABCD.A'B'C'D'$.
\choice[2]
{$\vec{CD}$}
{\True $\vec{D'C'}$}
{$\vec{AA'}$}
{$\vec{AD}$}
\loigiai{Do đó $\vec{AB}=\vec{D'C'}$.}
\end{ex}
\end{baidoc}`;
  const blocks = splitLatexQuestions(source);
  assert.equal(blocks.length, 2);
  const parsed = blocks.map(parseLatexQuestion);
  assert.deepEqual(parsed.map(item => item.questionType), ["single", "single"]);
  assert.deepEqual(parsed.map(item => item.optionColumns), [2, 2]);
  assert.deepEqual(parsed.map(item => item.correctAnswer), ["D", "B"]);
  assert.equal(parsed[0].options.length, 4);
  assert.equal(parsed[0].options[3]?.correct, true);
  assert.match(parsed[0].solution, /Điều kiện xác định/);
  assert.equal(parsed[1].options[1]?.label, String.raw`$\overrightarrow{D'C'}$`);
});

test("preserves every supported authored choice column count", () => {
  for (const columns of [2, 3, 4]) {
    const parsed = parseLatexQuestion(String.raw`\begin{ex}
Câu hỏi ${columns} cột
\choice[${columns}]
{\True A}
{B}
{C}
{D}
\end{ex}`);
    assert.equal(parsed.optionColumns, columns, `\\choice[${columns}]`);
  }
});

test("converts centered tabular environments into renderable tables", () => {
  const source = String.raw`\begin{ex}
Cho bảng số liệu:
\begin{center}
\begin{tabular}{|l|c|c|}
\hline
Khoảng & $[10;20)$ & $[20;30)$ \\ \hline
Số học sinh & $4$ & $8$ \\ \hline
\end{tabular}
\end{center}
\choice[2]
{A}
{\True B}
{C}
{D}
\end{ex}`;
  const parsed = parseLatexQuestion(source);
  assert.equal(parsed.optionColumns, 2);
  assert.match(parsed.prompt, /Khoảng .*\$\[10;20\)\$ .*\$\[20;30\)\$/);
  assert.match(parsed.prompt, /\| --- \| --- \| --- \|/);
  assert.match(parsed.prompt, /Số học sinh .*\$4\$ .*\$8\$/);
  assert.doesNotMatch(parsed.prompt, /\\begin\{(?:center|tabular)\}|\\hline/);
});

test("keeps enumerate item spacing compact for dash labels", () => {
  const normalized = normalizeLatexContent(String.raw`\begin{enumerate}[-]
    \item Mỗi ô điền đúng một số và mỗi số chỉ được sử dụng một lần;
    \item Hiệu hai số ở hai ô bất kì khác nhau trên cùng một hàng không chia hết cho $5$;
    \item Hiệu hai số ở hai ô bất kì khác nhau trên cùng một cột không chia hết cho $5$.
\end{enumerate}`);
  const lines = normalized.split("\n").filter(Boolean);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^- Mỗi ô/);
  assert.match(lines[1], /^- Hiệu hai số/);
  assert.match(lines[2], /^- Hiệu hai số/);
});

test("preserves multicolumn cells in tabular data", () => {
  const normalized = normalizeLatexContent(String.raw`\begin{center}
\begin{tabular}{|c|c|c|c|c|}
\hline
Ngay & \multicolumn{3}{c|}{So ki-lô-gam} & Tong so tien \\ \cline{2-4}
 & Rau muong & Bi xanh & Ca chua & (nghin dong) \\ \hline
Thu Tu & 19 & 14 & 10 & 600 \\ \hline
Thu Bay & 50 & 25 & 20 & \\ \hline
\end{tabular}
\end{center}`);
  assert.match(normalized, new RegExp(`${LATEX_TABLE_ALIGN_START}center${LATEX_TABLE_ALIGN_END}Ngay \\| ${LATEX_TABLE_ALIGN_START}center${LATEX_TABLE_ALIGN_END}${LATEX_TABLE_COLSPAN_START}3${LATEX_TABLE_COLSPAN_END}So ki-lô-gam \\| ${LATEX_TABLE_ALIGN_START}center${LATEX_TABLE_ALIGN_END}Tong so tien \\|`));
  assert.doesNotMatch(normalized, /\\multicolumn|\\cline|\\hline/);
});

test("preserves multirow cells in tabular data", () => {
  const normalized = normalizeLatexContent(String.raw`\begin{center}
\begin{tabular}{|c|c|c|c|c|}
\hline
\multirow{2}{*}{Ngày} & \multicolumn{3}{c|}{Số ki-lô-gam} & Tổng số tiền \\ \cline{2-4}
& Rau muống & Bí xanh & Cà chua & (nghìn đồng) \\ \hline
Thứ Tư & 19 & 14 & 10 & 600 \\ \hline
Thứ Bảy & 50 & 25 & 20 & \\ \hline
\end{tabular}
\end{center}`);
  assert.match(normalized, new RegExp(`${LATEX_TABLE_ROWSPAN_START}2${LATEX_TABLE_ROWSPAN_END}Ngày`));
  assert.match(normalized, new RegExp(`${LATEX_TABLE_COLSPAN_START}3${LATEX_TABLE_COLSPAN_END}Số ki-lô-gam`));
  assert.doesNotMatch(normalized, /\\multirow|\\multicolumn|\\cline|\\hline/);
});

test("does not add a blank paragraph before enumerate", () => {
  const normalized = normalizeLatexContent(String.raw`abc
\begin{enumerate}[-]
\item Dòng một
\item Dòng hai
\end{enumerate}`);
  assert.equal(normalized, "abc\n- Dòng một\n- Dòng hai");
});

test("normalizes eqnarray environments into aligned display math", () => {
  const normalized = normalizeLatexContent(String.raw`\begin{eqnarray*}
x&=&1\\
&\approx&1,00.
\end{eqnarray*}`);
  assert.equal(normalized, String.raw`$$\begin{aligned}x&=&1\\
&\approx&1,00.\end{aligned}$$`);
});

test("expands vec shorthand to overrightarrow in math content", () => {
  assert.equal(normalizeLatexContent(String.raw`$\vec{CD}$`), String.raw`$\overrightarrow{CD}$`);
  assert.equal(formatLatexAnswerForDisplay(String.raw`$\vec{AB}$`), String.raw`$\overrightarrow{AB}$`);
  assert.equal(normalizeLatexContent(String.raw`$\vector{AB}$`), String.raw`$\vector{AB}$`);
});

test("keeps bare vectors in choice labels as KaTeX math", () => {
  const parsed = parseLatexQuestion(String.raw`\begin{ex}
Chọn vectơ đúng:
\choice
    {\vec{AB}}
    {\overrightarrow{CD}}
\end{ex}`);
  assert.equal(parsed.options[0]?.label, String.raw`$\overrightarrow{AB}$`);
  assert.equal(parsed.options[1]?.label, String.raw`$\overrightarrow{CD}$`);
});

test("normalizes the heva system macro for KaTeX", () => {
  assert.equal(
    normalizeLatexContent(String.raw`\displaystyle \heva{x+y<0\\x-y>0}`),
    String.raw`$\displaystyle \begin{cases}x+y<0\\x-y>0\end{cases}$`,
  );
});

test("parses match/with as a matching question", () => {
  const source = String.raw`\begin{ex}
Hãy ghép các khái niệm ở cột trái với mô tả phù hợp:
\match
    {Kháng nguyên}
    {Tế bào T}
    {Tế bào B}
    {Lượng lớn kháng thể}
\with
    [3]{Có thể biệt hóa thành tế bào plasma.}
    [2]{Hoạt hóa khi tiếp xúc với tế bào tua gắn kháng nguyên.}
    [4]{Tạo ra bởi tế bào plasma.}
    [1]{Vào hạch bạch huyết ở hai dạng hòa tan và liên kết.}
\end{ex}`;
  const parsed = parseLatexQuestion(source);
  assert.equal(parsed.questionType, "ordering");
  assert.equal(parsed.options.map(option => option.label).join("|"), "Kháng nguyên|Tế bào T|Tế bào B|Lượng lớn kháng thể");
  assert.deepEqual(parsed.matching?.rightItems.map(item => item.label), [
    "Có thể biệt hóa thành tế bào plasma.",
    "Hoạt hóa khi tiếp xúc với tế bào tua gắn kháng nguyên.",
    "Tạo ra bởi tế bào plasma.",
    "Vào hạch bạch huyết ở hai dạng hòa tan và liên kết.",
  ]);
  assert.deepEqual(parsed.correctAnswer, ["4", "2", "1", "3"]);
  assert.equal(matchingError(parsed), "");
});

test("accepts more than 26 matching choices and generates extended labels", () => {
  const left = Array.from({ length: 30 }, (_, index) => `    {Ý trái ${index + 1}}`).join("\n");
  const right = Array.from({ length: 30 }, (_, index) => `    [${index + 1}]{Ý phải ${index + 1}}`).join("\n");
  const parsed = parseLatexQuestion(`\\begin{ex}\n\\match\n${left}\n\\with\n${right}\n\\end{ex}`);
  assert.equal(parsed.questionType, "ordering");
  assert.equal(parsed.matching?.leftItems.length, 30);
  assert.equal(parsed.matching?.rightItems.length, 30);
  assert.equal(parsed.matching?.rightItems[25]?.value, "Z");
  assert.equal(parsed.matching?.rightItems[26]?.value, "AA");
  assert.equal(parsed.matching?.rightItems[29]?.value, "AD");
  assert.equal(matchingError(parsed), "");
});

test("rejects the removed numeric choiceSX syntax", () => {
  const parsed = parseLatexQuestion(String.raw`\begin{ex}
Sắp xếp các ý sau:
\choiceSX
    [2]{Ý thứ nhất}
    [1]{Ý thứ hai}
\end{ex}`);
  assert.match(matchingError(parsed), /choiceSX \[số\]/);
});

const passage = String.raw`\begin{baidoc}
\tenbaidoc{Chất hoạt động bề mặt}
Chất hoạt động bề mặt là một thành phần chính của chất tẩy rửa làm sạch. Cấu trúc chất hoạt động bề mặt gồm hai phần:
\begin{enumerate}[1)]
\item Đuôi kỵ nước.
\item Đầu ưa nước.
\end{enumerate}
\begin{ex}
Chọn đáp án đúng.
\choice{A}{B}{C}{\True D}
\end{ex}
\end{baidoc}`;

test("keeps passage text outside tenbaidoc heading", () => {
  const parsed = parseBaidocDocument(passage)[0];
  assert.equal(parsed.heading, "Chất hoạt động bề mặt");
  assert.match(parsed.passage, /Chất hoạt động bề mặt\nChất hoạt động bề mặt là một thành phần chính/);
  assert.match(parsed.passage, /\\begin\{enumerate\}\[1\)\][\s\S]*\\item Đuôi kỵ nước/);
  assert.doesNotMatch(parsed.passage, /\\tenbaidoc\{[^}]*thành phần chính/);
});

test("renders the optional image caption command without changing the image command", () => {
  const source = String.raw`\chenanh{1}{/api/exam-images/example.webp}
\chuthich{Figure 1: 50\% caption}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\$\/image_\{\/api\/exam-images\/example\.webp\}_\{center\}_\{65\}_\{block\}\$/);
  assert.match(normalized, /\*Figure 1: 50% caption\*/);
});

test("renders an undelimited displaystyle formula inside an image caption", () => {
  const source = String.raw`\chuthich{Hình 2. Công \displaystyle A=S_{12{v_2}{v_1}}}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\*Hình 2\. Công \$\\displaystyle A=S_\{12\{v_2\}\{v_1\}\}\$\*/);
});

test("repairs escaped math punctuation in a legacy image caption", () => {
  const source = String.raw`\chuthich{Hình 2. Công \displaystyle A=S\_\{12\{v_2\}\{v_1\}\}}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\*Hình 2\. Công \$\\displaystyle A=S_\{12\{v_2\}\{v_1\}\}\$\*/);
});

test("recovers a caption whose outer brace closes before the dollar math", () => {
  const source = String.raw`\chuthich{Hình 2. Công $A=S_12{v_2}{v_1}}$}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\*Hình 2\. Công \$A=S_12\{v_2\}\{v_1\}\$\*/);
});

test("normalizes a multi-image row with an individual caption and pixel frame", () => {
  const source = String.raw`\anhhang[2][240x180]{{/api/exam-images/a.webp}{Caption A}}{{/api/exam-images/b.webp}{Caption B}}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\$\/image-row_\{center\}_\{2\}_\{240\}_\{180\}_\{/);
  assert.match(normalized, /%2Fapi%2Fexam-images%2Fa\.webp:Caption%20A/);
  assert.match(normalized, /%2Fapi%2Fexam-images%2Fb\.webp:Caption%20B/);
});

test("normalizes math inside every multi-image caption before splitting math tokens", () => {
  const source = String.raw`\anhhang[2][326x245]{{/api/exam-images/a.webp}{Caption A $A=S_{12V_2V_1}$}}{{/api/exam-images/b.webp}{{Caption B $A=S_{1a2b1}$}}}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\$\/image-row_\{center\}_\{2\}_\{326\}_\{245\}_\{/);
  assert.match(normalized, /Caption%20A%20%24A%3DS_%7B12V_2V_1%7D%24/);
  assert.match(normalized, /Caption%20B%20%24A%3DS_%7B1a2b1%7D%24/);
  assert.doesNotMatch(normalized, /%7BCaption%20B/);
});

test("unwraps nested baidoc wrappers and keeps the inner ex questions", () => {
  const source = String.raw`\begin{baidoc}
\item[] Outer instruction from {start} to {end}:
\begin{baidoc}
\item[] Inner instruction from {start} to {end}:
\begin{ex}
Solve $\log_3(x-1)=1$.
\choice
{$x=5$}
{$x=3$}
{$x=2$}
{\True $x=4$}
\loigiai{The solution is $x=4$.}
\end{ex}
\end{baidoc}
\end{baidoc}`;
  const parsed = parseBaidocDocument(source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.questions.length, 1);
  assert.equal(parsed[0]?.questions[0]?.correctAnswer, "D");
  assert.match(parsed[0]?.questions[0]?.solution ?? "", /The solution is/);
  assert.match(parsed[0]?.passage ?? "", /Outer instruction from/);
  assert.match(parsed[0]?.passage ?? "", /Inner instruction from/);
  assert.doesNotMatch(parsed[0]?.passage ?? "", /\\begin\s*\{\s*baidoc\s*\}/i);
});

test("keeps standalone ex questions when a baidoc is mixed into the source", () => {
  const source = String.raw`\phan1
\begin{baidoc}
\item[] Passage instruction:
\tenbaidoc{Passage heading}
\item Passage text.
\begin{ex}
Passage question.
\choice{A}{\True B}
\end{ex}
\end{baidoc}
\begin{ex}
Standalone question.
\choice{\True A}{B}
\end{ex}`;
  const entries = parseBaidocQuestionEntries(source);
  assert.equal(entries.length, 2);
  assert.match(entries[0]?.passage ?? "", /Passage heading/);
  assert.equal(entries[1]?.passage, null);
  assert.match(entries[0]?.source ?? "", /^\\phan1\s+\\begin\{ex\}/);
  assert.match(entries[0]?.source ?? "", /Passage question/);
  assert.match(entries[1]?.source ?? "", /Standalone question/);
});

test("accepts a THPTQG baidoc without a tenbaidoc heading", () => {
  const source = String.raw`\phan1
\begin{baidoc}
\item[] Read data and answer questions from question {start} - {end}:
\item Plain passage text without a title command.
\begin{ex}
Passage question.
\choice{\True A}{B}
\end{ex}
\end{baidoc}`;
  const parsed = parseBaidocDocument(source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.heading, "");
  assert.match(parsed[0]?.passage ?? "", /Read data.*question 1 - 1/);
  assert.match(parsed[0]?.passage ?? "", /Plain passage text without a title command/);
  assert.doesNotMatch(parsed[0]?.passage ?? "", /\\tenbaidoc/);
});

test("continues baidoc instruction question numbers after standalone ex questions", () => {
  const source = String.raw`\begin{ex}
Question one.
\choice{\True A}{B}
\end{ex}
\begin{ex}
Question two.
\choice{A}{\True B}
\end{ex}
\begin{ex}
Question three.
\choice{\True A}{B}
\end{ex}
\begin{baidoc}
\item[] Read the data and answer questions from question {start} - {end}:
\tenbaidoc{Reading}
Passage text.
\begin{ex}
Passage question one.
\choice{A}{\True B}
\end{ex}
\begin{ex}
Passage question two.
\choice{\True A}{B}
\end{ex}
\end{baidoc}`;
  const parsed = parseBaidocDocument(source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.questionStart, 4);
  assert.equal(parsed[0]?.questionEnd, 5);
  assert.match(parsed[0]?.instruction ?? "", /question 4 - 5/);
  assert.match(parsed[0]?.passage ?? "", /question 4 - 5/);
});

test("normalizes a legacy multi-image row without captions", () => {
  const source = String.raw`\anhhang[3]{/api/exam-images/a.webp}{/api/exam-images/b.webp}{/api/exam-images/c.webp}`;
  const normalized = normalizeLatexContent(source);
  assert.match(normalized, /\$\/image-row_\{center\}_\{3\}_\{0\}_\{0\}_\{/);
  assert.match(normalized, /%2Fapi%2Fexam-images%2Fc\.webp:/);
});

test("keeps an explicit baidoc instruction when present", () => {
  const source = passage.replace(
    "\\tenbaidoc{Chất hoạt động bề mặt}",
    "\\item[] Dựa vào thông tin dưới đây và trả lời các câu hỏi từ câu {start} - {end}:\n\\tenbaidoc{Chất hoạt động bề mặt}",
  );
  const parsed = parseBaidocDocument(source)[0];
  assert.match(parsed.passage, /^Dựa vào thông tin dưới đây/);
  assert.match(parsed.passage, /\nChất hoạt động bề mặt\nChất hoạt động bề mặt là một thành phần chính/);
});
