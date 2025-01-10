import * as vscode from 'vscode';
import regex2diagnostics from '../util/regex2diagnostics';

export default function LLAlignAnd(doc: vscode.TextDocument): vscode.Diagnostic[] {
    return regex2diagnostics(
        doc,
        "LLAlignAnd",
        /(=|\\neq|\\leq|\\geq|\\le|\\ge|<|>)\s*&/g
    );
}
