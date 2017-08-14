export function assert(condition) {
    if (!condition) {
        // remove this in production code
        throw "Assertion failed: " + condition;
    }
}
