const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, stubs = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (!name.startsWith(".")) return require(name);
    const base = path.resolve(path.dirname(filename), name);
    const resolved = [base + ".ts", base + ".tsx", path.join(base, "index.ts")].find(fs.existsSync);
    if (!resolved) throw new Error(`Cannot load ${name} from ${file}`);
    return load(path.relative(root, resolved), stubs);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}
module.exports = { load };
