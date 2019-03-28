import * as fs from "fs";
import * as path from "path";

export interface IUniq<T> {
  [key: string]: T;
}

/**
 * Read Git information
 *
 * @param {string} root root folder
 */
function readGitMeta(root: string, callback: (err: Error | null, git?: IGit) => void) {
  fs.readFile(path.join(root, ".git/HEAD"), "utf8", (branchErr, branchData) => {
    if (branchErr) { return callback(branchErr); }
    const branch = branchData.slice(16, -1);
    fs.readFile(path.join(root, `.git/refs/heads/${branch}`), "utf8", (headErr, head) => {
      if (headErr) { return callback(headErr); }
      callback(null, {root, head, branch});
    });
  });
}

/**
 * Detect git root, branch and head
 *
 * @param {string} directory Directory to start from
 */
export interface IGit {
  root: string;
  branch: string;
  head: string;
}

export function detectGit(directory: string, callback: (err: Error | null, git?: IGit) => void, iter = 0) {
  // Stop at root or 10-th iteration
  if (directory === "/" || iter === 10) {
    return callback(new Error("no git root detected"));
  }
  // Go one folder up
  const dir = path.dirname(directory);
  // Locate .git
  fs.stat(`${dir}/.git`, (err, stats) => {
    if (err) {
      // Try one folder up
      detectGit(dir, callback, iter + 1);
    } else {
      // Return git root
      readGitMeta(dir, callback);
    }
  });
}

/**
 * Ensures all directories of the path are created
 */
export function ensureDirectory(dirPath: string, callback: (err: Error | null) => void) {
  fs.stat(dirPath, (statErr) => {
    if (statErr) {
      const parentDir = path.dirname(dirPath);
      ensureDirectory(parentDir, (ensErr) => {
        if (ensErr) { return callback(ensErr); }
        fs.mkdir(dirPath, callback);
      });
      return;
    }
    callback(null);
  });
}

/**
 * Race untill first success
 */
export function raceSuccess<S>(promises: Array<Promise<S>>): Promise<S> {
  return Promise.all(promises.map((p) => (
    p.then(
      (val) => Promise.reject(val),
      (err) => Promise.resolve(err),
    )
  ))).then(
    (errors) => Promise.reject(errors),
    (val) => Promise.resolve(val),
  );
}

/**
 * Read file and return Promise
 *
 * @param {string} filepath full path to the file
 */
function readFileAsync(filepath: string) {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(filepath, "utf8", (err, data) => {
      if (err) {
        return reject(err);
      }
      resolve(data);
    });
  });
}

/**
 * Read any file from the list
 */
export function readAnyFile(filePaths: string[]): Promise<{file: string, data: string}> {
  return raceSuccess(filePaths.map((fp) => {
    return readFileAsync(fp).then(
      (data) => Promise.resolve({file: fp, data}),
      (err) => Promise.reject(err),
    );
  }));
}

/**
 * Creates an object composed of the picked object properties.
 */
export const pick = <T, K extends keyof T>(object: T, ...keys: K[]): Pick<T, K> => {
  const result: any = {};
  keys.forEach((k) => {
    result[k] = object[k];
  });
  return result;
};

/**
 * Creates an object with the same keys as object and values generated by running callback function
 */
export const mapValues = <V, T>(
  object: T,
  callback: (value: T[keyof T], key: keyof T, obj: T) => V,
): Record<keyof T, V> => {
  const result: any = {};
  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      result[key] = callback(object[key], key, object);
    }
  }
  return result;
};

/**
 * Converts promise to callback
 */
export const toCallback = <S>(promise: Promise<S>, callback: (error: Error | null, args?: S) => void) => {
  promise.then((args) => callback(null, args), (err) => callback(err));
};

/**
 * Get random item from array
 */
export const randomItem = <S>(items: S[] | ReadonlyArray<S>) => items[Math.floor(Math.random() * items.length)];

/**
 * Read directory recursively
 */
export const readRecursively = (fsPath: string, ext = "") =>
  new Promise<{[key: string]: string}>((resolve, reject) => {
    // Absolute path
    const abs = path.resolve(fsPath);
    fs.stat(abs, (statErr, stats) => {
      if (statErr) { return reject(statErr); }
      // Read file content if matches extension
      if (stats.isFile() && path.extname(abs).includes(ext)) {
        readFileAsync(abs).then((cont) => resolve({[abs]: cont}), reject);
        return;
      }
      if (stats.isDirectory()) {
        // Read directory conent
        fs.readdir(abs, (readErr, files) => {
          if (readErr) { return reject(readErr); }
          const paths = files.map((f) => path.join(abs, f));
          // Read files content and merge together
          Promise.all(paths.map((p) => readRecursively(p, ext))).then((values) => {
            resolve(Object.assign({}, ...values));
          }, reject);
        });
        return;
      }
      resolve({});
    });
  });