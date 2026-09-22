const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const start = source.indexOf('async function _setAttributeValue(');
const end = source.indexOf('\nfunction getStoredState', start);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);

test('state can show and hide a folder section repeatedly', async () => {
    const element = {
        hidden: true,
        getAttribute(name) { return name === 'hidden' && this.hidden ? '' : null; }
    };
    for (const [value, expected] of [[false, false], [true, true], ['false', false], ['', true]]) {
        await context._setAttributeValue(element, 'hidden', value, true);
        assert.equal(element.hidden, expected);
    }
});
