# CoCreate-state

`@cocreate/state` provides declarative state persistence and state-driven UI updates for CoCreate applications. A source element stores selected values under one or more keys, and elements with matching `state-id` attributes replay those values into their attributes, values, classes, or element methods.

[Docs and demo](https://cocreate.app/docs/state) | [Changelog](https://github.com/CoCreate-app/CoCreate-state/blob/master/CHANGELOG.md) | [Issues](https://github.com/CoCreate-app/CoCreate-state/issues)

## Installation

### CDN

```html
<script src="https://cdn.cocreate.app/state/latest/CoCreate-state.min.js"></script>
```

### npm

```bash
npm install @cocreate/state
```

```javascript
import "@cocreate/state";
```

### yarn

```bash
yarn add @cocreate/state
```

## Core model

State has two sides:

- A **writer** has `state-to="key"` and one or more `state.*` attributes.
- A **reader** has `state-id="key"` and receives the stored values associated with that key.

```html
<button
	state-to="profile"
	state.data-name="Ada Lovelace"
	state.data-role="admin"
>
	Select profile
</button>

<div state-id="profile" data-name="" data-role="">
	Profile details
</div>
```

When the button is activated, the module stores `{ "data-name": "Ada Lovelace", "data-role": "admin" }` under `profile`, then applies those values to the reader. The reader declares the target attributes because ordinary attributes are only assigned when the target already has that attribute. State keys and IDs can be comma-separated and whitespace is trimmed.

## Writer attributes

| Attribute | Purpose | Example |
| --- | --- | --- |
| `state-to` | One or more comma-separated state keys to write. | `state-to="profile, sidebar"` |
| `state.*` | Captures an attribute value under the name after `state.`. | `state.name="Ada"` |
| `state-localstorage` | Writes to local storage instead of session storage. | `state-localstorage` |
| `state-onstoragechange` | Uses local storage and opts a reader into storage-change reinitialization. | `state-onstoragechange` |
| `state-title` | Sets the document title used for the history entry. | `state-title="Profile"` |

The `state.*` syntax is an attribute namespace. For example, `state.class="selected"` stores a class value under `class`; `state.value=""` reads the writer's current value through `getValue()`.

## Reader attributes

| Attribute | Purpose | Example |
| --- | --- | --- |
| `state-id` | One or more state keys whose values should be applied to the element. | `state-id="profile"` |
| `state-overwrite` | Allows overwriting by default; set to `false` to preserve existing values. | `state-overwrite="false"` |
| `state-localstorage` | Reads from local storage instead of session storage. | `state-localstorage` |
| `state-onstoragechange` | Reads local storage and allows the reader to refresh after a storage event. | `state-onstoragechange` |

The reader applies each stored property according to the following rules:

- `value` updates the element's value or calls its CoCreate `setValue()` method.
- `class` adds the stored class names to the existing class list.
- An ordinary HTML attribute is set only when the reader already declares that attribute; overwrite controls whether its existing value may be replaced.
- A key beginning with `$` invokes the matching element method or assigns its property. For example, `$focus` can call `focus()` when the target supports it.

## Session and local storage

By default, state is stored in the CoCreate session storage adapter under the single `state` record. Add `state-localstorage` to the writer and reader to use the local storage adapter instead.

```html
<button
	state-to="theme"
	state-localstorage
	state.mode="dark"
>
	Dark theme
</button>

<body state-id="theme" state-localstorage>
	...
</body>
```

The storage record is a JSON object keyed by state ID:

```json
{
	"theme": {
		"mode": "dark"
	}
}
```

`state-onstoragechange` is also treated as a local-storage marker. Readers with this attribute are reinitialized when a browser `storage` event for the `state` key is received. Storage events normally notify other documents, not the document that performed the write.

## Overwrite behavior

State overwrites existing reader values by default. No `state-overwrite` attribute is needed:

```html
<form state-id="offcanvas-app-form" array="" object=""></form>
<button state-to="offcanvas-app-form" state.array="apps" state.object="first-id">First app</button>
<button state-to="offcanvas-app-form" state.array="apps" state.object="second-id">Second app</button>
```

Clicking the buttons in order changes the form's `object` from `first-id` to `second-id`.

Set `state-overwrite="false"` on the **reader** to preserve its existing nonempty attributes:

```html
<form state-id="initial-app" state-overwrite="false" array="" object=""></form>
<button state-to="initial-app" state.array="apps" state.object="first-id">First app</button>
<button state-to="initial-app" state.array="apps" state.object="second-id">Second app</button>
```

The first click fills the empty `array` and `object` attributes. The second click leaves those values unchanged. An attribute that already has a nonempty value in the HTML is preserved from the start.

| Reader attribute | Behavior |
| --- | --- |
| Omitted | Overwrite existing values (default). |
| `state-overwrite` or `state-overwrite=""` | Overwrite existing values. |
| `state-overwrite="true"` | Overwrite existing values. |
| `state-overwrite="false"` | Preserve existing nonempty values. |

Use the exact value `"false"` to disable overwrite. The stored `overwrite` property does not control this behavior.

This is a check of the reader's current value, not a one-time initialization flag. Clearing a declared attribute to `""` allows state to fill it again. Stored state can still change, and other readers can continue receiving updates.

Readers must declare the ordinary attributes they accept, such as `array=""` and `object=""`; enabling overwrite does not add undeclared attributes. Values, classes, and `$` methods follow the rules below.

## Values, classes, and methods

### Values

An empty `state.value` attribute reads the writer's current value asynchronously:

```html
<input id="query" value="co">
<button state-to="search" state.value="">Save search</button>
<input state-id="search">
```

If the value is not empty, the literal attribute value is stored. Readers may use native `.value` assignment or `setValue()` depending on the element state and overwrite rules.

### Classes

Class values are split on whitespace and added to the reader without removing existing classes:

```html
<button state-to="tabs" state.class="active">Current</button>
<div state-id="tabs" class="tab">Tab</div>
```

State currently adds classes; it does not provide a declarative class-removal operation.

### Element methods and properties

Keys beginning with `$` are interpreted as element operations:

```html
<button state-to="focus" state.$focus="">Focus input</button>
<input state-id="focus">
```

The target must expose the named property or method. A method receives the stored value as its argument. Unsupported operations are ignored.

## Navigation and browser history

State writes create a history entry at the current URL and include serialized session state, local state, title, and URL in the history state object. `state-title` updates `document.title` before the entry is pushed, falling back to the current document title.

The special values `$back` and `$forward` in a stored `src` or `href` request browser history navigation:

```html
<button state-to="navigation" state.href="$back">Back</button>
<button state-to="navigation" state.href="$forward">Forward</button>
```

When either value is used, the module calls `history.back()` or `history.forward()` and does not write a new state record for that activation. On `popstate`, stored session and local state are restored and all `state-id` readers are initialized again.

## Actions integration

The module registers a `state` action with `@cocreate/actions`. Action chains can therefore invoke state persistence and wait for the `stateEnd` completion event:

```html
<button
	actions="state, notify"
	state-to="profile"
	state.name="Ada"
>
	Save
</button>
```

Direct clicks on `[state-to]` elements are handled automatically. If the clicked element is inside an element whose `actions` attribute contains `state`, the document click handler skips the direct call so the action system can own the operation and completion lifecycle.

## JavaScript API

The default export exposes the following functions:

```javascript
import CoCreateState from "@cocreate/state";

CoCreateState.initElements(document.querySelectorAll("[state-id]"));
CoCreateState.initElement(document.querySelector("[state-id]"));
await CoCreateState.stateAttributes(document.querySelector("[state-to]"));
```

### `initElements(elements)`

Initializes each reader in an iterable collection. It reads the selected storage record and applies matching state IDs.

### `initElement(element)`

Initializes one reader. A comma-separated `state-id` applies values from each matching key in order.

### `stateAttributes(element)`

Collects `state.*` attributes from the clicked or action element, writes them under each `state-to` key, updates matching readers immediately, and dispatches `stateEnd` when complete.

## Lifecycle

- The module initializes `[state-id]` elements during module load.
- Added nodes matching `[state-id]` are initialized through `@cocreate/observer`.
- A document click on the nearest `[state-to]` ancestor triggers a state write unless an enclosing action chain owns `state`.
- Browser `storage` events refresh readers opted into `state-onstoragechange`.
- Browser `popstate` restores the state captured in the history entry and reinitializes readers.

## Current limitations and implementation notes

These points reflect the current implementation and are important when designing integrations:

- State is stored as one JSON object under the `state` key in each storage adapter. State values should therefore remain JSON serializable.
- `state-localstorage` and `state-onstoragechange` select local storage for both writers and readers. A reader using only session storage will not see a local state key.
- State writers call `_getStateId()` immediately, so matching readers update before the storage write completes. Storage and reader updates are intentionally coupled.
- Class state is additive. Writing a new class does not remove a previous state class.
- Ordinary attribute assignment requires the reader to declare the target attribute. Overwrite is enabled by default; `state-overwrite="false"` preserves nonempty existing attributes.
- The source checks `element.closest("href")` when deciding whether to push history. `href` is normally an attribute on an anchor rather than an HTML element name, so links should be tested carefully; this is a likely navigation bug and should be reviewed before relying on it.
- `init()` registers global click, storage, load, and popstate listeners immediately when the module is imported. Applications should avoid loading the module more than once.
- There is no built-in state deletion or reset attribute. Clearing a key currently requires writing a new state object through the storage adapter or adding an explicit integration.

## Troubleshooting

### A reader does not update

Confirm that its `state-id` exactly matches a `state-to` key, including whitespace after comma splitting. Confirm that the reader and writer select the same storage type and that the stored state JSON is valid.

### A value is not replaced

Check whether the reader has `state-overwrite="false"`. Remove it to restore the default overwrite behavior. For ordinary attributes, also ensure the reader declares the target attribute.

### Another tab does not refresh

Use `state-localstorage` or `state-onstoragechange` on the reader. The browser storage event is cross-document and does not fire in the same document that performed the write.

### The action chain continues too early

Use the registered action name `state` and ensure the action element receives the `stateEnd` event. Direct calls to a custom wrapper must await `stateAttributes()` when sequencing depends on completion.

## Contributing

Please read the [contributing guide](https://github.com/CoCreate-app/CoCreate-state/blob/master/CONTRIBUTING.md), open an [issue](https://github.com/CoCreate-app/CoCreate-state/issues), or submit a pull request. Changes to storage selection, state shape, attribute assignment, history behavior, and the `stateEnd` event are compatibility-sensitive and should include documentation and examples.

## License

This software is dual-licensed under the GNU Affero General Public License version 3 (AGPLv3) and a commercial license.

- **Open source use:** For open-source projects and non-commercial use, the software is available under the AGPLv3. See the [LICENSE file](https://github.com/CoCreate-app/CoCreate-state/blob/master/LICENSE).
- **Commercial use:** For-profit use requires a commercial license from [CoCreate](https://cocreate.app).
