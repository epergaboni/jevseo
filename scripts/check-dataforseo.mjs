#!/usr/bin/env node
/**
 * Verify a DataForSEO credential pair against the live API, outside the app.
 *
 *   node scripts/check-dataforseo.mjs            prompt for credentials
 *   node scripts/check-dataforseo.mjs --save     prompt, then store if they work
 *   node scripts/check-dataforseo.mjs --saved    re-test what is already stored
 *
 * The password is never echoed, so it does not land in shell history. Nothing
 * is written unless --save is passed, and then only after the pair has been
 * accepted. `appendix/user_data` reports the account balance and costs nothing,
 * so this never spends a SERP credit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { stdin, stdout, argv, exit } from "node:process";

const ENDPOINT = "https://api.dataforseo.com/v3/appendix/user_data";
const STORE = ".jevseo.local.json";

/**
 * Read two values from a real terminal, hiding the second as it is typed.
 *
 * Muting the OUTPUT stream rather than intercepting input keeps readline as
 * the only consumer of stdin; intercepting input steals the data and the
 * prompt never resolves.
 */
function askTty(questions) {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: stdin, output, terminal: true });

  const one = ({ text, hidden }) =>
    new Promise((resolve) => {
      // readline must own the prompt string. Writing it manually and calling
      // question("") makes readline redraw the line with an empty prompt,
      // which wipes the label and leaves the typed value floating alone.
      muted = false;
      rl.question(text, (answer) => {
        muted = false;
        if (hidden) stdout.write("\n");
        resolve(answer);
      });
      // Mute only the echo, after readline has written its prompt.
      muted = hidden === true;
    });

  return (async () => {
    const answers = [];
    for (const question of questions) answers.push(await one(question));
    rl.close();
    return answers;
  })();
}

/**
 * Non-interactive stdin. readline in non-terminal mode drops lines between
 * sequential question() calls, so read the whole stream and split it instead.
 * This also makes the script usable in a pipeline:
 *
 *   printf 'login\npassword\n' | node scripts/check-dataforseo.mjs
 */
async function readPipedLines(count) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
  if (lines.filter((l) => l.trim() !== "").length < count) {
    console.error(
      `Expected ${count} lines on stdin (login, then password), or run this in a terminal to be prompted.`,
    );
    exit(1);
  }
  return lines.slice(0, count);
}

function describe(label, value) {
  const trimmed = value.trim();
  const odd = [...trimmed].filter((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126);
  const notes = [];
  if (value !== trimmed) {
    notes.push(`trimmed ${value.length - trimmed.length} whitespace character(s)`);
  }
  if (odd.length) notes.push(`${odd.length} non-printable or non-ASCII character(s)`);
  if (trimmed === "") notes.push("EMPTY");
  console.log(
    `  ${label}: ${trimmed.length} characters${notes.length ? `  ← ${notes.join(", ")}` : ""}`,
  );
}

const UNAUTHORISED = `
  40100 covers four different problems, and the message does not say which:

    1. The API password is not your dashboard password. It is set separately
       at https://app.dataforseo.com/api-access — open that page and copy both
       the login and the password from it.
    2. The API login may not be your account email. That same page shows the
       exact login string to use.
    3. A new account must confirm its email before the API answers at all.
    4. IP access restriction may be switched on with this machine's address
       missing from the allow list.
`;

const useSaved = argv.includes("--saved");
const saveOnSuccess = argv.includes("--save");

/** Merge a verified pair into the local store the settings page also reads. */
function persist(loginValue, passwordValue) {
  const existing = existsSync(STORE) ? JSON.parse(readFileSync(STORE, "utf8")) : {};
  const next = { ...existing, DATAFORSEO_LOGIN: loginValue, DATAFORSEO_PASSWORD: passwordValue };
  writeFileSync(STORE, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
let login, password;

if (useSaved) {
  if (!existsSync(STORE)) {
    console.error(`No ${STORE} found. Run without --saved to type them in.`);
    exit(1);
  }
  const store = JSON.parse(readFileSync(STORE, "utf8"));
  login = store.DATAFORSEO_LOGIN ?? "";
  password = store.DATAFORSEO_PASSWORD ?? "";
  if (!login || !password) {
    console.error(`${STORE} does not hold both a DataForSEO login and password.`);
    exit(1);
  }
  console.log(`Using the pair saved in ${STORE}.`);
} else {
  if (stdin.isTTY) {
    console.log("Copy both values from https://app.dataforseo.com/api-access\n");
    [login, password] = await askTty([
      { text: "API login    : " },
      { text: "API password : ", hidden: true },
    ]);
  } else {
    [login, password] = await readPipedLines(2);
  }
}

// Describe what arrived BEFORE trimming, so stray whitespace is reported
// rather than silently repaired.
console.log("\nWhat was supplied:");
describe("login   ", login);
describe("password", password);

login = login.trim();
password = password.trim();

const auth = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
console.log(`\nGET ${ENDPOINT}`);

let res;
try {
  res = await fetch(ENDPOINT, { headers: { authorization: auth } });
} catch (error) {
  console.error(`\nCould not reach DataForSEO: ${error.message}`);
  exit(2);
}

const body = await res.json().catch(() => null);
const code = body?.status_code;
console.log(`HTTP ${res.status} · status_code ${code ?? "none"}`);
console.log(`${body?.status_message ?? "(no message)"}\n`);

if (res.ok && typeof code === "number" && code < 40000) {
  const money = body?.tasks?.[0]?.result?.[0]?.money;
  console.log("✓ These credentials work.");
  if (typeof money?.balance === "number") {
    console.log(`  Account balance: $${money.balance.toFixed(2)}`);
    if (money.balance <= 0) {
      console.log("  The balance is zero, so SERP requests will still fail. Top up first.");
    }
  }
  if (saveOnSuccess) {
    try {
      persist(login, password);
      console.log(`\n  Saved to ${STORE} (owner-read-only, gitignored).`);
      console.log("  The running app picks this up on its next request — no restart needed.");
    } catch (error) {
      console.log(`\n  Could not write ${STORE}: ${error.message}`);
      console.log("  Paste them into /settings instead.");
      exit(1);
    }
  } else {
    console.log("\n  Paste them into /settings, or re-run with --save to store them now.");
  }
  exit(0);
}

console.log("✗ DataForSEO refused these credentials.");
if (code === 40100 || res.status === 401) console.log(UNAUTHORISED);
exit(1);
