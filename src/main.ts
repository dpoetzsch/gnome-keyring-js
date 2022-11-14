/*
 * KeyMan - A gnome shell extension to access the keyring in a convenient way
 * (c) 2014 David Poetzsch-Heffter <gnome-dev@poehe.de>
 * This file is distributed under the same licence as the KeyMan package.
 * See file LICENSE for details.
 */

import * as Gio from "Gio";
import * as GLib from "GLib";
import * as Lang from "Lang";

//imports.searchPath.push('.');
//const Interfaces = imports.keyringInterfaces;
import * as Interfaces from './keyring-interfaces';
import { assert } from "./utils";

const bus = Gio['DBus'].session;
const secretBus = 'org.freedesktop.secrets';

export interface Item {
    label: string;
    path: string;
    locked?: boolean;
}

export type SecretCallback = (label: string, secret: string) => void;

export function makeItem(label, path): Item {
    return {"label":label, "path":path};
}

// tuples [signalProvider, signalID]
type SignalConnection = [any, string]

export class KeyringConnection {
    private service;
    private session;
    private signalConnections: SignalConnection[];
    private labelCache: { [key: string]: string | null | undefined };

    constructor() {
        this.service = new Interfaces.SecretServiceProxy(bus,
                secretBus, '/org/freedesktop/secrets');

        let result = this.service.OpenSessionSync("plain",
                GLib['Variant'].new('s', ""));
        this.session = result[1];
        
        this.signalConnections = [];

        // maps item paths to item labels because fetching the label
        // for a path is slow (around 5ms on my machine). We have to do
        // this for *all* items, so searching can easily take a second or
        // so. Using the cache we have a major performance gain that even
        // allows searching as you type
        this.labelCache = {}
    }
    
    close() {
        // disconnect from all signals
        for (const con of this.signalConnections) {
            con[0].disconnectSignal(con[1]);
        }
    
        const sessionObj = new Interfaces.SecretSessionProxy(bus, secretBus,
                this.session);
        sessionObj.CloseSync();
    }
    
    private _getSecret(path: string, relock: boolean, callback: SecretCallback) {
        const item = new Interfaces.SecretItemProxy(bus, secretBus, path);
        
        const secret_res = item.GetSecretSync(this.session);

        const label = item.Label;
        const secret = secret_res[0][2];

        if (relock) {
            let res = this.service.LockSync([path]);
            assert(res[1] == "/");
        }

        callback(String(label), String(secret));
    }

    /**
     * Invalidates all entries in the label cache for the specified collection.
     */
    private invalidateLabelCache(forCollectionPath: string) {
        for (const k of Object.keys(this.labelCache)) {
            if ((k as any).startsWith(forCollectionPath)) {
                delete this.labelCache[k];
            }
        }
    }
    
    /**
     * Fetch the label and secret of an item with the specified path.
     * callback is a function(label, secret) that gets called when the
     * information is fetched.
     * If unlocking is needed this will only work if imports.mainloop is
     * running.
     */
    getSecretFromPath(path: string, callback: SecretCallback) {
        this.unlockObject(path, (wasLockedBefore) => {
            this._getSecret(path, wasLockedBefore, callback);
        });
    }
    
    /**
     * Unlock an object.
     * callback is a function(wasLockedBefore) called with a boolean
     * value that indicates wether the object was locked before.
     */
    unlockObject(path, callback: (lockedBefore: boolean) => void) {
        let result = this.service.UnlockSync([path]);
        let ul_prompt_path = result[1];
        
        if (ul_prompt_path != "/") {
            // in this case the keyring needs to be unlocked by the user
            let prompt = new Interfaces.SecretPromptProxy(bus,
                    secretBus, ul_prompt_path);

            this.signalConnections.push([prompt,
                prompt.connectSignal("Completed", () => {
                    // invalidate label cache for this collection
                    // (there might be paths with null values in it)
                    this.invalidateLabelCache(path);

                    callback(true);
                })]);
            prompt.PromptSync("");
        } else {
            callback(false);
        }
    }
    
    lockObject(path) {
        const res = this.service.LockSync([path]);
        assert(res[1] == "/");
    }
    
    /**
     * Fetch the label of an item with the specified path.
     */
    getItemLabelFromPath(path): string | undefined | null {
        if (this.labelCache.hasOwnProperty(path)) {
            return this.labelCache[path];
        } else {
            const item = new Interfaces.SecretItemProxy(bus, secretBus, path);
            this.labelCache[path] = item.Label;
            return item.Label;
        }
    }

    getAllItemPaths(): string[] {
        const searchResult = this.service.SearchItemsSync([]);
        return searchResult[0].concat(searchResult[1]);
    }
    
    /**
     * Return all secret items that match a number of search strings.
     * @arg searchStrs An array of strings that must be contained in the
     *                 label of matching secret items
     * @return An array of matching secret items (see makeItem for details)
     */
    getItems(searchStrs: string[]): Item[] {
        searchStrs = searchStrs.map(s => s.toLowerCase());
    
        const allItems = this.getAllItemPaths();
        
        let matchingItems: Item[] = [];
        
        for (const path of allItems) {
            let label = this.getItemLabelFromPath(path);

            if (!label) {
                continue;
            }

            let labelLow = label.toLowerCase();
            let isMatch = true;
            for (const s of searchStrs) {
                if (labelLow.indexOf(s) === -1) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                matchingItems.push(makeItem(label, path));
            }
        }
        
        return matchingItems;
    }

    getAllItems(): Item[] {
        return this.getItems([]);
    }
    
    /**
     * Return all collections as items (see makeItem for details).
     * Each collection item additionally has a boolean flag locked.
     */
    getCollections(): Item[] {
        let res: Item[] = [];
        for (let i in this.service.Collections) {
            let path = this.service.Collections[i];
            let col = new Interfaces.SecretCollectionProxy(bus, secretBus, path);
            let item = makeItem(col.Label, path);
            item.locked = col.Locked;
            res.push(item);
        }
        return res;
    }
    
    /**
     * @callback is called whenever a collection is created, deleted or changed.
     */
    connectCollectionChangedSignal(callback: () => void) {
        this.signalConnections.push([this.service,
            this.service.connectSignal("CollectionCreated", function (collection) {
                callback();
            })
        ]);
        this.signalConnections.push([this.service,
            this.service.connectSignal("CollectionDeleted", function (collection) {
                callback();
            })
        ]);
        this.signalConnections.push([this.service,
            this.service.connectSignal("CollectionChanged", function (collection) {
                callback();
            })
        ]);
    }
}
