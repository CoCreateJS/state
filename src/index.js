import "@cocreate/element-prototype";
import Observer from "@cocreate/observer";
import Action from "@cocreate/actions";
import { uuid } from "@cocreate/utils";
import storage from "@cocreate/local-storage";

const { localStorage, sessionStorage } = storage;

async function syncActiveState() {
    if (!("serviceWorker" in navigator)) return;

    const message = {
        action: "setActiveState",
        state: sessionStorage.getItem("state") || "{}",
        theme: window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
    };
    const worker = navigator.serviceWorker.controller ||
        (await navigator.serviceWorker.ready).active;
    worker?.postMessage(message);
}

function syncVisibleState() {
    if (document.visibilityState === "visible") void syncActiveState();
}

function init() {
    let elements = document.querySelectorAll("[state-id]");
    initElements(elements);

    window.addEventListener("storage", function (e) {
        if (e.key == "state") {
            // Re-initialize only elements that are explicitly listening to storage changes
            elements = document.querySelectorAll(
                '[state-id][state-onstoragechange]:not([state-onstoragechange="false"])'
            );
            initElements(elements);
        }
    });

    document.addEventListener("click", function (e) {
        const target = e.target.closest("[state-to], [state]");
        if (target) {
            if (target.closest('[actions*="state"]')) return;
            stateAttributes(target);
        }
    });

    window.matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", syncActiveState);
    navigator.serviceWorker?.addEventListener("controllerchange", syncActiveState);
    window.addEventListener("focus", syncVisibleState);
    window.addEventListener("pageshow", syncVisibleState);
    document.addEventListener("visibilitychange", syncVisibleState);
    syncVisibleState();
}

/**
 *
 * @public
 * @environment client
 */
function initElements(elements) {
    for (let element of elements) initElement(element);
}

/**
 *
 * @public
 * @environment client
 */
function initElement(element) {
    let state_id = element.getAttribute("state-id");
    if (!state_id) return;

    // Determine target storage based on attributes
    let isLocal = element.hasAttribute("state-localstorage") || element.hasAttribute("state-onstoragechange");
    let storageObj = isLocal ? localStorage : sessionStorage;

    let statedAttributes = storageObj.getItem("state");

    if (!statedAttributes || statedAttributes.length == 0) return;

    try {
        statedAttributes = JSON.parse(statedAttributes);
    } catch(e) {
        return;
    }

    // Split state-id string into an array of trimmed individual IDs
    const idArray = state_id.split(',').map(id => id.trim()).filter(Boolean);

    // Apply values stored under each ID listed in the array
    for (let id of idArray) {
        let attrValues = statedAttributes[id];
        if (!attrValues) continue; // Continue to ensure other IDs in the array still process
        _setAttributeValues(element, attrValues);
    }
}

function _setAttributeValues(el, attrValues) {
    const isOverwrite = el.getAttribute("state-overwrite") !== "false";

    for (const key of Object.keys(attrValues)) {
        _setAttributeValue(el, key, attrValues[key], isOverwrite);
    }
}

async function _setAttributeValue(element, attribute, value, isOverwrite) {
    if (!element.getAttribute(attribute) || isOverwrite) {
        if (attribute === "hidden") {
            element.hidden = value !== false && value !== "false" && value !== null;
        } else if (attribute == "value") {
            if (element.value == "" || (element.value && isOverwrite))
                element.value = value;
            else if (
                isOverwrite ||
                (element.hasAttribute("value") && !(await element.getValue()))
            )
                element.setValue(value);
        } else if (attribute === "class" && value) {
            const classes = String(value).split(/\s+/).filter(Boolean);
            if (classes.length) element.classList.add(...classes);
        } else if (element.hasAttribute(attribute) && (value || value === "")) {
            element.setAttribute(attribute, value);
        } else if (attribute.startsWith("$")) {
            // Handle using operators.js
            const prop = attribute.substring(1);
            if (element[prop]) {
                if (typeof element[prop] === "function") {
                    element[prop](value);
                } else {
                    element[prop] = value;
                }
            }
        }
    }
}

function getStoredState(storageObj) {
    try {
        const state = JSON.parse(storageObj.getItem("state") || "{}");
        return state && typeof state === "object" && !Array.isArray(state)
            ? state
            : {};
    } catch (error) {
        return {};
    }
}

function normalizeUnset(value) {
    if (Array.isArray(value))
        return value.map(String).map(key => key.trim()).filter(Boolean);
    if (typeof value === "string")
        return value.split(",").map(key => key.trim()).filter(Boolean);
    return [];
}

function unsetKeys(state, keys) {
    if (!state || typeof state !== "object") return false;
    let changed = false;
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(state, key)) continue;
        delete state[key];
        changed = true;
    }
    return changed;
}

function unsetElementValues(element, keys) {
    for (const key of keys) {
        if (key.startsWith("$")) {
            const property = key.slice(1);
            if (
                Object.prototype.hasOwnProperty.call(element, property) &&
                typeof element[property] !== "function"
            ) {
                try {
                    delete element[property];
                } catch (error) {
                    element[property] = undefined;
                }
            }
            continue;
        }

        if (key === "value") {
            element.setValue("");
            element.removeAttribute("value");
        } else {
            element.removeAttribute(key);
        }
    }
}

function _unsetStateId(keys, stateId) {
    if (!keys.length) return;
    const elements = document.querySelectorAll("[state-id]");
    for (const element of elements) {
        const ids = (element.getAttribute("state-id") || "")
            .split(",")
            .map(id => id.trim())
            .filter(Boolean);
        if (ids.includes(stateId)) unsetElementValues(element, keys);
    }
}

function mergeState(targetState, state, updates) {
    if (!state || typeof state !== "object" || Array.isArray(state))
        return false;

    let changed = false;
    for (const [stateId, values] of Object.entries(state)) {
        if (!values || typeof values !== "object" || Array.isArray(values))
            continue;

        const unset = normalizeUnset(values.$unset);
        const nextValues = { ...values };
        delete nextValues.$unset;
        targetState[stateId] = {
            ...targetState[stateId],
            ...nextValues
        };
        if (unset.length) {
            unsetKeys(targetState[stateId], unset);
            if (updates) updates.push(() => _unsetStateId(unset, stateId));
            else _unsetStateId(unset, stateId);
        }
        const valuesToApply = { ...targetState[stateId] };
        if (updates) updates.push(() => _getStateId(valuesToApply, stateId));
        else _getStateId(valuesToApply, stateId);
        changed = Object.keys(nextValues).length > 0 || unset.length > 0 || changed;
    }

    return changed;
}

function persistState({
    sessionState,
    localState,
    sessionChanged,
    localChanged,
    title = document.title,
    updateHistory = true
}) {
    if (sessionChanged)
        sessionStorage.setItem("state", JSON.stringify(sessionState));
    if (localChanged)
        localStorage.setItem("state", JSON.stringify(localState));
    if (sessionChanged) void syncActiveState();

    if (title) document.title = title;
    if (updateHistory) {
        history.pushState(
            {
                sessionState: JSON.stringify(sessionState),
                localState: JSON.stringify(localState),
                title,
                url: location.href
            },
            title,
            location.href
        );
    }
}

/**
 *
 * @public
 * @environment client
 */
function setState(state, options = {}) {
    const sessionState = getStoredState(sessionStorage);
    const localState = getStoredState(localStorage);
    const isLocal =
        options.storage === "local" || options.localStorage === true;
    const changed = mergeState(isLocal ? localState : sessionState, state);

    if (!changed) return false;

    persistState({
        sessionState,
        localState,
        sessionChanged: !isLocal,
        localChanged: isLocal,
        title: options.title || document.title || ""
    });
    return true;
}

/**
 *
 * @public
 * @environment client
 */
async function stateAttributes(element) {
    let sessionState = getStoredState(sessionStorage);
    let localState = getStoredState(localStorage);

    const updates = [];
    let elements = [];

    if (element.hasAttribute("state-to") || element.hasAttribute("state"))
        elements.push(element);
    let nestedElements = element.querySelectorAll("[state-to], [state]");
    elements.push(...nestedElements);
    let current = element;
    while (current) {
        if (
            (current.hasAttribute("state-to") || current.hasAttribute("state")) &&
            !elements.includes(current)
        ) {
            elements.push(current);
        }
        current = current.parentElement;
    }

    let changeState = false;
    let sessionChanged = false;
    let localChanged = false;
    let triggerIsLocal = element.hasAttribute("state-localstorage") || element.hasAttribute("state-onstoragechange");

    for (let i = 0; i < elements.length; i++) {
        let isLocal =
            triggerIsLocal ||
            elements[i].hasAttribute("state-localstorage") ||
            elements[i].hasAttribute("state-onstoragechange");
        const targetState = isLocal ? localState : sessionState;
        const stateValue = elements[i].getAttribute("state");

        if (stateValue) {
            try {
                const parsedState = typeof stateValue === "string"
                    ? JSON.parse(stateValue)
                    : stateValue;
                if (mergeState(targetState, parsedState, updates)) {
                    if (isLocal) localChanged = true;
                    else sessionChanged = true;
                }
            } catch (error) {
                console.warn("Invalid state JSON:", stateValue, error);
            }
        }

        let attrValues = await _getAttributeValues(elements[i]);
        if (attrValues.src === "$back" || attrValues.href === "$back") {
            changeState = true;
            window.history.back();
            break;
        } else if (
            attrValues.src === "$forward" ||
            attrValues.href === "$forward"
        ) {
            changeState = true;
            window.history.forward();
            break;
        }

        let state_to = elements[i].getAttribute("state-to");
        if (!state_to) continue;

        // Parse state-to string into an array of trimmed individual target keys
        let stateToKeys = state_to.split(',').map(s => s.trim()).filter(Boolean);

        for (let toKey of stateToKeys) {
            // A state-to writer defines the complete state for its target.
            // Replace the prior value so stale attributes and actions do not
            // survive subsequent writes.
            const unset = normalizeUnset(attrValues.$unset);
            const nextValues = { ...attrValues };
            delete nextValues.$unset;

            if (Object.keys(nextValues).length) {
                updates.push(() => _getStateId(nextValues, toKey));
                targetState[toKey] = nextValues;
            } else if (!targetState[toKey]) {
                targetState[toKey] = {};
            }

            if (unset.length) {
                unsetKeys(targetState[toKey], unset);
                updates.push(() => _unsetStateId(unset, toKey));
            }

            if (Object.keys(nextValues).length || unset.length) {
                if (isLocal) localChanged = true;
                else sessionChanged = true;
            }
        }
    }

    let href = element.closest("href");
    if (!changeState) {
        const title = element.getAttribute("state-title") || document.title || "";
        persistState({
            sessionState,
            localState,
            sessionChanged,
            localChanged,
            title,
            updateHistory: !href
        });
        // Source observers must see the complete selection in X-State.
        for (const update of updates) update();
    }

    element.dispatchEvent(
        new CustomEvent("stateEnd", {
            detail: {}
        })
    );
}

async function _getAttributeValues(element) {
    let attributeValues = {};
    let attributes = element.attributes;
    for (let attribute of attributes) {
        if (attribute.name.startsWith("state.")) {
            const key = attribute.name.slice(6);
            if (attribute.value == "$uuid") {
                Object.assign(attributeValues, { [key]:  uuid(6) });
            } else if (key === "value" && !attribute.value) {
                Object.assign(attributeValues, { value: await element.getValue() });
            } else {
                Object.assign(attributeValues, { [key]: element.getAttribute(attribute.name) });
            }
        }
    }
    return attributeValues;
}

// Scans elements containing [state-id] and updates those matching the target key
function _getStateId(attrValues, state_to) {
    const elements = document.querySelectorAll('[state-id]');
    for (let element of elements) {
        let state_id_attr = element.getAttribute("state-id") || "";
        let idArray = state_id_attr.split(',').map(id => id.trim()).filter(Boolean);
        if (idArray.includes(state_to)) {
            _setAttributeValues(element, attrValues);
        }
    }
}

window.onload = function () {
    if (!history.length) {
        const sessionState = sessionStorage.getItem("state") || "";
        const localState = localStorage.getItem("state") || "";
        history.replaceState(
            { sessionState, localState, url: location.href, title: document.title },
            document.title,
            location.href
        );
    } else if (!history.state || history.state.url !== location.href) {
        const sessionState = sessionStorage.getItem("state") || "";
        const localState = localStorage.getItem("state") || "";
        history.pushState(
            { sessionState, localState, url: location.href, title: document.title },
            document.title,
            location.href
        );
    }
};

window.addEventListener("popstate", function (event) {
    if (event.state) {
        if (event.state.sessionState || event.state.localState) {
            if (event.state.sessionState) sessionStorage.setItem("state", event.state.sessionState);
            if (event.state.localState) localStorage.setItem("state", event.state.localState);

            let elements = document.querySelectorAll("[state-id]");
            initElements(elements);
        }

        if (event.state.url && event.state.url !== window.location.href) {
            if (event.state.title)
                sessionStorage.setItem("currentPageTitle", event.state.title);

            location.href = event.state.url;
        } else if (event.state.title) {
            document.title = event.state.title;
        }
    }
});

Observer.init({
    name: "CoCreateState",
    types: ["addedNodes"],
    selector: "[state-id]",
    callback: function (mutation) {
        initElement(mutation.target);
    }
});

Action.init({
    name: "state",
    endEvent: "stateEnd",
    callback: (action) => {
        stateAttributes(action.element);
    }
});

init();

export { setState };
export default { initElements, initElement, stateAttributes, setState };

/**
 *
 * @name state
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name state-id
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name state-localstorage
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name state-onstoragechange
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name state-overwrite
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name state-title
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name state-to
 * @kind member
 * @attribute
 * @environment client
 */

/**
 *
 * @name value
 * @kind member
 * @attribute
 * @environment client
 */

/**
 * Data attributes which can be used for components in CoCreate framework combined as a group of attributes that dynamically change attributes & fetch custom data.
 *
 * @module state
 * @environment client
 */

/**
 * Declarative selectors recognized by this module.
 *
 * @name declarative-selectors
 * @kind member
 * @selectors
 * @environment client
 * @example
 * ```json
 * [
 *   "[state-id]"
 * ]
 * ```
 */
