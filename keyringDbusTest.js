imports.searchPath.push('dist');
const KeyringConnection = imports.keyringDbus.KeyringConnection;

let con = new KeyringConnection();

// let paths = con.getAllItemPaths();
// for (var i in paths) {
//     print(paths[i]);
// }

// let test_item_path = "/org/freedesktop/secrets/collection/test/1";
// con.getSecretFromPath(test_item_path, function(label, secret) {
//     print("Label : " + label);
//     print("Secret: " + secret);
//     con.close();
// });

// Test caching (should be really fast in the second run and just a bit slower in the third)
let t1 = Date.now();
let items = con.getItems(['github']);
print('Item count: ' + items.length);
print('First run: ' + (Date.now() - t1));

t1 = Date.now();
items = con.getItems(['github']);
print('Item count: ' + items.length);
print('Second run: ' + (Date.now() - t1));

con.unlockObject('/org/freedesktop/secrets/collection/test', function() {
    t1 = Date.now();
    items = con.getItems(['github']);
    print('Item count: ' + items.length);
    print('Third run: ' + (Date.now() - t1));
});

imports.mainloop.run();
