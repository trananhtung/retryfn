#!/usr/bin/env node
import { spawn } from "node:child_process";
import { retry } from "./retry.js";

const HELP = `retryfn — run a command with retries and exponential backoff

Usage:
  retryfn [options] -- <command> [args...]

Options:
  --retries, -r <n>    Max retries after the first try   (default: 3)
  --min <ms>           Base delay for the first retry      (default: 500)
  --max <ms>           Maximum single delay                (default: 30000)
  --factor <n>         Backoff multiplier                  (default: 2)
  --jitter <s>         full | equal | none                 (default: full)
  --help, -h           Show this help

Retries while the command exits non-zero. Exits with the command's last code.

Examples:
  retryfn -r 5 -- curl -fsS https://flaky.example.com/health
  retryfn --min 1000 --factor 3 -- ./deploy.sh`;

function getOpt(args: string[], names: string[]): string | undefined {
  for (const n of names) {
    const i = args.indexOf(n);
    if (i !== -1) return args[i + 1];
  }
  return undefined;
}

function run(cmd: string, cmdArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`command exited with code ${code}`), { code }));
    });
  });
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    process.stdout.write(HELP + "\n");
    return argv.length === 0 ? 1 : 0;
  }

  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) {
    process.stderr.write("retryfn: provide a command after `--`\n");
    return 1;
  }

  const opts = argv.slice(0, sep);
  const [cmd, ...cmdArgs] = argv.slice(sep + 1);

  const retries = Number(getOpt(opts, ["--retries", "-r"]) ?? 3);
  const minDelay = Number(getOpt(opts, ["--min"]) ?? 500);
  const maxDelay = Number(getOpt(opts, ["--max"]) ?? 30_000);
  const factor = Number(getOpt(opts, ["--factor"]) ?? 2);
  const jitter = (getOpt(opts, ["--jitter"]) ?? "full") as "full" | "equal" | "none";

  let lastCode = 1;
  try {
    await retry(() => run(cmd!, cmdArgs), {
      retries,
      minDelay,
      maxDelay,
      factor,
      jitter,
      onRetry: ({ attempt, delay, error }) => {
        lastCode = (error as { code?: number })?.code ?? 1;
        process.stderr.write(
          `retryfn: attempt ${attempt + 1} failed (code ${lastCode}); retrying in ${delay}ms…\n`,
        );
      },
    });
    return 0;
  } catch (err) {
    lastCode = (err as { code?: number })?.code ?? 1;
    process.stderr.write(`retryfn: giving up after retries (last code ${lastCode})\n`);
    return lastCode;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
