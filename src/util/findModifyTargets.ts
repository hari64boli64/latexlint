import * as vscode from 'vscode';
import isInComment from '../util/isInComment';

class Command {
    success: boolean = false;
    isBegin: boolean = false;
    commandStart: number = -1; // open interval
    braceStart: number = -1;   // open interval
    wordStart: number = -1;    // open interval
    wordEnd: number = -1;      // closed interval
    braceEnd: number = -1;     // closed interval

    //  \begin { XXX }     (In LaTeX, no spaces or line breaks are allowed in braces)
    // 0      6 7   A B    (Thus, wordStart = braceStart + 1, wordEnd = braceEnd - 1)

    constructor(text: string | undefined, cursorOffset: number | undefined) {
        if (text === undefined || cursorOffset === undefined) return;

        // Check if the cursor is inside the braces
        this.braceStart = cursorOffset - Number(text[cursorOffset] === '}');
        while (this.braceStart > 0 && text[this.braceStart] !== '{' && text[this.braceStart] !== '}')
            this.braceStart--;
        this.braceEnd = cursorOffset;
        while (this.braceEnd < text.length && text[this.braceEnd] !== '{' && text[this.braceEnd] !== '}')
            this.braceEnd++;
        this.braceEnd++;
        if (text[this.braceStart] !== '{' || text[this.braceEnd - 1] !== '}') {
            vscode.window.showErrorMessage('Cursor is not inside the braces.');
            return;
        }

        // Check if the cursor is inside \begin{...} or \end{...}
        this.commandStart = this.braceStart;
        while (this.commandStart > Math.max(0, this.braceStart - 6) && text[this.commandStart] !== '\\')
            this.commandStart--;
        const command = text.substring(this.commandStart, this.braceStart);
        if (command === '\\begin') this.isBegin = true;
        else if (command === '\\end') this.isBegin = false;
        else {
            vscode.window.showErrorMessage('The cursor is not inside \\begin{...} or \\end{...}');
            return;
        }

        // Check if the content inside the braces is a single word
        this.wordStart = this.braceStart + 1;
        this.wordEnd = this.braceEnd - 1;
        const content = text.substring(this.wordStart, this.wordEnd);
        if (!content.match(/^\w+\*?$/)) {
            // This matches [1+ word characters][optional *]
            vscode.window.showErrorMessage('The content inside the braces is invalid.');
            return;
        }

        this.success = true;
    }

    parseFromIndex(text: string, delta: number, index: number): Command {
        // From the index at "\", parse the command
        console.assert(text[index] === '\\');
        this.commandStart = index;
        this.braceStart = text.indexOf('{', this.commandStart);
        this.braceEnd = text.indexOf('}', this.braceStart) + 1;
        if (text[this.braceStart] !== '{' || text[this.braceEnd - 1] !== '}') {
            vscode.window.showErrorMessage('bug: parseFromIndex failed.');
            this.success = false;
        }
        this.wordStart = this.braceStart + 1;
        this.wordEnd = this.braceEnd - 1;
        this.isBegin = delta === 1;
        this.success = true;
        return this;
    }
}

function findCorrespondingCommand(text: string, command: Command): Command {
    let otherCommand = new Command(undefined, undefined);

    // Extract all \begin{...} and \end{...} commands
    let cmdPairs = [];
    for (const { regex, delta } of [
        { regex: /\\begin\{.*\}/g, delta: +1 },
        { regex: /\\end\{.*\}/g, delta: -1 }
    ])
        for (const match of text.matchAll(regex)) {
            if (isInComment(text, match.index)) continue;
            cmdPairs.push({ index: match.index, delta, depth: 0 });
        }
    cmdPairs.sort((a, b) => a.index - b.index);

    // Check if the commands are properly nested
    let depth = 0;
    for (let pair of cmdPairs) {
        pair.depth = (depth += pair.delta);
        if (pair.depth < 0) break;
    }
    if (depth !== 0) {
        vscode.window.showErrorMessage(
            "Unmatched \\begin and \\end commands. Are the commands valid and properly nested?"
        );
        return otherCommand;
    }

    // Find the corresponding command
    const commandIndex = cmdPairs.findIndex(pair => pair.index === command.commandStart);
    if (commandIndex === -1) {
        vscode.window.showErrorMessage(`bug: the selected command is not found in the text.`);
        return otherCommand;
    }
    const delta = cmdPairs[commandIndex].delta;
    let targetIndex = commandIndex;
    while (
        delta === +1 ?
            cmdPairs[commandIndex].depth - cmdPairs[commandIndex].delta !== cmdPairs[targetIndex].depth :
            cmdPairs[targetIndex].depth - cmdPairs[targetIndex].delta !== cmdPairs[commandIndex].depth
    ) {
        targetIndex += delta;
        if (targetIndex < 0 || targetIndex >= cmdPairs.length) {
            vscode.window.showErrorMessage(`bug: the corresponding command is not found.`);
            return otherCommand;
        }
    }
    return otherCommand.parseFromIndex(text, cmdPairs[targetIndex].delta, cmdPairs[targetIndex].index);
}

export default function findModifyTargets(
    selection: vscode.Selection,
    document: vscode.TextDocument,
): {
    originalText: string,
    cursorPos: number,
    newTextCountForCursor: number,
    s1: string,
    s2: string,
    s3: string,
} | undefined {
    const activePosition = selection.active;

    if (document.lineAt(activePosition).text.trim().startsWith('%')) {
        vscode.window.showErrorMessage('The cursor line is commented out.');
        return undefined;
    }

    const text = document.getText();
    const cursorOffset = document.offsetAt(activePosition);

    let command = new Command(text, cursorOffset);
    if (!command.success) return undefined;

    let otherCommand = findCorrespondingCommand(text, command);
    if (!otherCommand.success) return undefined;

    if (text.substring(command.wordStart, command.wordEnd) !== text.substring(otherCommand.wordStart, otherCommand.wordEnd)) {
        vscode.window.showErrorMessage('The content inside \\begin{...} and \\end{...} should be the same.');
        return undefined;
    }

    const s1 = Math.min(command.wordStart, otherCommand.wordStart);
    const e1 = Math.min(command.wordEnd, otherCommand.wordEnd);
    const s2 = Math.max(command.wordStart, otherCommand.wordStart);
    const e2 = Math.max(command.wordEnd, otherCommand.wordEnd);

    const originalText = text.substring(command.wordStart, command.wordEnd);
    const cursorPos = (command.wordStart === s1)
        ? s1 // + newText.length
        : s1 + s2 - e1; // + 2 * newText.length
    const newTextCountForCursor = 2 - Number(command.wordStart === s1);

    return {
        originalText,
        cursorPos,
        newTextCountForCursor,
        s1: text.substring(0, s1),
        s2: text.substring(e1, s2),
        s3: text.substring(e2),
    };
}
