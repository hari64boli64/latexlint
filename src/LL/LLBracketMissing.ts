import * as vscode from 'vscode';
import { messages } from '../util/constants';
import ranges2diagnostics from '../util/ranges2diagnostics';

export default function LLBracketMissing(doc: vscode.TextDocument, txt: string): vscode.Diagnostic[] {
    const ranges: vscode.Range[] = [];

    // In Markdown, _ can be used for various purposes, unlike in LaTeX.
    // e.g. _italic_, ![test_image](test.png), [^test_link] etc.
    // We skip the check for markdown files, quite regretfully.
    // Can you think of a way to check even in markdown files?
    if (doc.languageId !== "latex") return [];

    for (const match of txt.matchAll(/(?<![\\\[])[\^_][0-9A-Za-z]{2}/g)) {
        let i = match.index;
        // Test if the word is a url
        while (i > 1 && !/\s/.test(txt[i - 1])) i--;
        const word = txt.slice(i, match.index);
        if (word.includes("http")) continue;
        ranges.push(new vscode.Range(doc.positionAt(match.index), doc.positionAt(match.index + 3)));
    }
    const code = "LLBracketMissing";
    const message = messages[code];
    return ranges2diagnostics(code, message, ranges);
}
