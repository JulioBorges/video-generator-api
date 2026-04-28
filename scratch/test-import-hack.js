async function test() {
    try {
        // Use a dynamic import that TS won't transpile to require
        const ephone = await (new Function('return import("ephone")'))();
        console.log("Success! roa exists:", !!ephone.roa);
    } catch (err) {
        console.error("Failed:", err);
    }
}

test();
