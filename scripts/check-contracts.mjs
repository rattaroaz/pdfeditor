import { spawnSync } from "node:child_process";

for (const script of ["check-versions.mjs", "check-invoke-contract.mjs"]) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
