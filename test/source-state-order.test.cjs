const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');

function setup() {
    let stored = JSON.stringify({ 'offcanvas-app-form': { array: 'apps', object: 'previous' } });
    const requests = [];
    const warnings = [];
    const updates = [];
    const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
    const context = vm.createContext({
        console: { ...console, warn: (...args) => warnings.push(args) }, sessionStorage: storage,
        localStorage: { getItem: () => '{}', setItem() {} },
        document: { title: 'Apps' }, location: { href: 'http://localhost/apps' },
        history: { pushState() {} }, CustomEvent: class {},
        syncActiveState() {},
        getStoredState: store => JSON.parse(store.getItem('state')),
        normalizeUnset: () => [], unsetKeys() {}, _unsetStateId() {},
        _getAttributeValues: async element => element.values,
        _getStateId(values, target) {
            updates.push({ target, values: JSON.parse(JSON.stringify(values)) });
            if (target === 'offcanvas-app-view') requests.push(JSON.parse(stored)['offcanvas-app-form'].object);
        }
    });
    vm.runInContext(source.slice(source.indexOf('function mergeState('), source.indexOf('function setState(')) +
        source.slice(source.indexOf('async function stateAttributes('), source.indexOf('async function _getAttributeValues(')), context);
    return { apply: context.stateAttributes, requests, warnings, updates, getState: () => JSON.parse(stored) };
}

function element(attributes, values = {}, children = []) {
    return { values, parentElement: null,
        getAttribute: name => attributes[name] ?? null,
        hasAttribute: name => Object.hasOwn(attributes, name),
        querySelectorAll: () => children, closest: () => null, dispatchEvent() {} };
}

for (const format of ['nested attributes', 'JSON', 'evaluated object']) {
    test(`source requests see the newly selected app (${format})`, async () => {
        const { apply, requests } = setup();
        for (const id of ['first-app', 'second-app']) {
            const view = { src: '/apps/apps/aside.html' };
            const record = { array: 'apps', object: id };
            const state = { 'offcanvas-app-view': view, 'offcanvas-app-form': record };
            const trigger = format !== 'nested attributes'
                ? element({ state: format === 'JSON' ? JSON.stringify(state) : state })
                : element({ 'state-to': 'offcanvas-app-view' }, view,
                    [element({ 'state-to': 'offcanvas-app-form' }, record)]);
            await apply(trigger);
        }
        assert.deepEqual(requests, ['first-app', 'second-app']);
    });
}

for (const evaluated of [false, true]) {
    test(`new conversation reset accepts ${evaluated ? 'an AST-evaluated object' : 'JSON text'}`, async () => {
        const { apply, warnings, updates, getState } = setup();
        const state = {
            'ai-conversation-messages': { 'filter-query-value': '', array: '', $renderValue: { object: [] } },
            'ai-queue-conversation-filter': { 'filter-query-value': '' },
            aiChat: { 'conversation-id': '' },
            'ai-chat-conversation-id': { value: '' },
            'ai-chat-model': { value: 'openai:gpt-5.4-nano', array: 'ai-conversations', object: '', realtime: 'false' }
        };
        await apply(element({ state: evaluated ? state : JSON.stringify(state) }));
        assert.deepEqual(warnings, []);
        for (const [id, values] of Object.entries(state)) {
            assert.deepEqual(getState()[id], values);
            assert.deepEqual(updates.find(update => update.target === id)?.values, values);
        }
    });
}

test('malformed state JSON still warns without changing stored state', async () => {
    const { apply, warnings, updates, getState } = setup();
    const before = getState();
    await apply(element({ state: '{broken' }));
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], 'Invalid state JSON:');
    assert.deepEqual(updates, []);
    assert.deepEqual(getState(), before);
});
