import templateFile from '../../templates/py314.json';
import type { Templates } from '../generated/analysis';

/**
 * The Try it yourself commands, apart from the rest of the page's text, so the worker that runs them loads only the
 * Template file, not the Reference Library and everything else the Explanations need.
 */

/** The name the Program is saved under for the commands, until file upload (ticket 19) supplies the learner's own. */
export const FILE_NAME = 'program.py';

/**
 * The Try it yourself commands the browser's Python runs, for a Program saved as `fileName`, in zoom level order. It runs
 * each one on the Program, so the Analysis carries what it printed; strace, which it can't run, is left out. The build
 * allows no slot but {file} in a command, and a command is shown as it is typed, so nothing else in it is markup: 2**3
 * stays 2**3.
 */
export const tryItCommands = (fileName: string) =>
  Object.values((templateFile as Templates).tryIt ?? {})
    .filter(({ inBrowser }) => inBrowser !== false)
    .map(({ command }) => commandFor(command, fileName));

/** A Try it yourself command, for a Program saved as `fileName`. */
export const commandFor = (command: string, fileName: string) => command.replaceAll('{file}', fileName);
