//! Turns `theme.json`'s `space`, `cols`, `radius`, `size`, `type` and `motion` into consts, so `theme::space::pad` stays a
//! `const` a region can use anywhere. A malformed file fails the build, never the window.

use std::fmt::Write as _;
use std::{env, fs, path::Path};

use serde_json::Value;

/// A number, or the name of an earlier `space` key.
fn operand(v: &Value, key: &str) -> String {
    match v {
        Value::Number(n) => format!("{:?}", n.as_f64().expect("a finite number")),
        Value::String(name) => name.clone(),
        other => panic!("theme.json {key}: {other} is neither a number nor a space name"),
    }
}

fn section<'a>(root: &'a Value, name: &str) -> &'a serde_json::Map<String, Value> {
    root[name]
        .as_object()
        .unwrap_or_else(|| panic!("theme.json has no `{name}` object"))
}

fn main() {
    println!("cargo:rerun-if-changed=theme.json");
    let text = fs::read_to_string("theme.json").expect("deck/rune/theme.json");
    let root: Value = serde_json::from_str(&text).expect("theme.json is not valid JSON");

    let mut space = String::new();
    for (key, v) in section(&root, "space") {
        let _ = writeln!(space, "pub const {key}: f32 = {};", operand(v, key));
    }
    let cols = section(&root, "cols");
    let field = |name: &str| operand(&cols[name], name);
    let _ = writeln!(
        space,
        "pub const cols: StatusCols = StatusCols {{ slice_ch: {}, state_ch: {}, time_ch: {}, gap: {} }};",
        field("slice_ch"),
        field("state_ch"),
        field("time_ch"),
        field("gap"),
    );

    let mut motion = String::new();
    for (key, v) in section(&root, "motion") {
        let pair = v
            .as_array()
            .filter(|a| a.len() == 2)
            .unwrap_or_else(|| panic!("theme.json motion.{key} is not [stiffness, damping]"));
        let _ = writeln!(
            motion,
            "pub const {key}: Spring = Spring::new({}, {});",
            operand(&pair[0], key),
            operand(&pair[1], key)
        );
    }

    let consts = |name: &str| {
        let mut out = String::new();
        for (key, v) in section(&root, name) {
            let _ = writeln!(out, "pub const {key}: f32 = {};", operand(v, key));
        }
        out
    };

    // The type scales: `header`, `body` and `caption`, each a size and a weight, in two families;
    // `h1` and `h2` are the markdown bodies' two larger headings (`theme::type_::heading`).
    let ty = section(&root, "type");
    let family = |key: &str| {
        ty[key]
            .as_str()
            .unwrap_or_else(|| panic!("theme.json type.{key} is not a name"))
    };
    let mut scales = format!(
        "pub const UI: &str = {:?};\npub const MONO: &str = {:?};\n",
        family("ui"),
        family("mono")
    );
    for name in ["header", "body", "caption", "h1", "h2"] {
        let scale = &ty[name];
        let _ = writeln!(
            scales,
            "pub const {}: TextStyle = TextStyle::new({}, {});",
            name.to_uppercase(),
            operand(&scale["size"], name),
            operand(&scale["weight"], name)
        );
    }

    let out = env::var("OUT_DIR").expect("OUT_DIR");
    fs::write(Path::new(&out).join("type.rs"), scales).expect("write type.rs");
    fs::write(Path::new(&out).join("space.rs"), space).expect("write space.rs");
    fs::write(Path::new(&out).join("radius.rs"), consts("radius")).expect("write radius.rs");
    fs::write(Path::new(&out).join("opacity.rs"), consts("opacity")).expect("write opacity.rs");
    fs::write(Path::new(&out).join("size.rs"), consts("size")).expect("write size.rs");
    fs::write(Path::new(&out).join("motion.rs"), motion).expect("write motion.rs");
}
