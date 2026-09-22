const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');

function setup() {
    let stored = JSON.stringify({ 'offcanvas-app-form': { array: 'apps', object: 'previous' } });
    const requests = [];
    const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
    const context = vm.createContext({
        console, sessionStorage: storage,
        localStorage: { getItem: () => '{}', setItem() {} },
        document: { title: 'Apps' }, location: { href: 'http://localhost/apps' },
        history: { pushState() {} }, CustomEvent: class {},
        syncActiveState() {},
        getStoredState: store => JSON.parse(store.getItem('state')),
        normalizeUnset: () => [], unsetKeys() {}, _unsetStateId() {},
        _getAttributeValues: async element => element.values,
        _getStateId(values, target) {
            if (target === 'offcanvas-app-view') requests.push(JSON.parse(stored)['offcanvas-app-form'].object);
        }
    });
    vm.runInContext(source.slice(source.indexOf('function mergeState('), source.indexOf('function setState(')) +
        source.slice(source.indexOf('async function stateAttributes('), source.indexOf('async function _getAttributeValues(')), context);
    return { apply: context.stateAttributes, requests };
}

function element(attributes, values = {}, children = []) {
    return { values, parentElement: null,
        getAttribute: name => attributes[name] ?? null,
        hasAttribute: name => Object.hasOwn(attributes, name),
        querySelectorAll: () => children, closest: () => null, dispatchEvent() {} };
}

for (const json of [false, true]) {
    test(`source requests see the newly selected app (${json ? 'JSON' : 'nested attributes'})`, async () => {
        const { apply, requests } = setup();
        for (const id of ['first-app', 'second-app']) {
            const view = { src: '/apps/apps/aside.html' };
            const record = { array: 'apps', object: id };
            const trigger = json
                ? element({ state: JSON.stringify({ 'offcanvas-app-view': view, 'offcanvas-app-form': record }) })
                : element({ 'state-to': 'offcanvas-app-view' }, view,
                    [element({ 'state-to': 'offcanvas-app-form' }, record)]);
            await apply(trigger);
        }
        assert.deepEqual(requests, ['first-app', 'second-app']);
    });
}
