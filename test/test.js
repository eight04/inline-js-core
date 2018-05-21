/* eslint-env mocha */

const assert = require("assert");
const sinon = require("sinon");

describe("parser", () => {
  describe("parsePipes", () => {
    const {parsePipes} = require("../lib/parser");
    
    it("basic", () => {
      const result = parsePipes("test:123");
      assert.deepEqual(result, [{name: "test", args: ["123"]}]);
    });
    
    it("no value", () => {
      const result = parsePipes("a");
      assert.deepEqual(result, [{name: "a", args: []}]);
    });
    
    it("multiple values", () => {
      const result = parsePipes("a:b,c");
      assert.deepEqual(result, [{name: "a", args: ["b", "c"]}]);
    });
    
    it("escape characters", () => {
      const result = parsePipes("a\\:b:a\\,b");
      assert.deepEqual(result, [{name: "a:b", args: ["a,b"]}]);
    });
  });

  describe("parseDirective", () => {
    const {parseDirective} = require("../lib/parser");
    
    it("shortcut", () => {
      const result = parseDirective("$inline.shortcut('a', 'b')");
      assert.equal(result.type, "$inline.shortcut");
      assert.deepEqual(result.params, ["a", "b"]);
    });
  });

  describe("parseText", () => {
    const {parseText} = require("../lib/parser");
    
    it("$inline", () => {
      const [result] = parseText("$inline('path/to/file')");
      assert.equal(result.type, "$inline");
      assert.deepEqual(result.params, ["path/to/file"]);
    });
    
    it("start and end", () => {
      const [left, result, right] = parseText("$inline.start('./a.txt')\ntest\n$inline.end");
      assert.equal(left.type, "text");
      assert.equal(left.value, "$inline.start('./a.txt')\n");
      
      assert.equal(result.type, "$inline.start");
      assert.deepEqual(result.params, ["./a.txt"]);
      
      assert.equal(right.type, "text");
      assert.equal(right.value, "\n$inline.end");
    });
    
    it("line", () => {
      const [left, result, right] = parseText("test\ntest$inline.line('path/to/file')test\ntest");
      assert.equal(left.type, "text");
      assert.equal(left.value, "test\n");
      
      assert.equal(result.type, "$inline.line");
      assert.deepEqual(result.params, ["path/to/file"]);
      
      assert.equal(right.type, "text");
      assert.equal(right.value, "\ntest");
    });
    
    it("shortcut", () => {
      const content = "$inline.shortcut('test', 'file|t1:$2,$1')";
      const [result, text] = parseText(content);
      assert.equal(result.type, "$inline.shortcut");
      assert.deepEqual(result.params, ["test", "file|t1:$2,$1"]);
      
      assert.equal(text.type, "text");
      assert.equal(text.value, content);
    });
  });
});

describe("shortcut", () => {
  const {createShortcutExpander} = require("../lib/shortcut");
  const {parsePipes} = require("../lib/parser");
  
  function prepare(name, expand) {
    const shortcuts = createShortcutExpander();
    shortcuts.add({name, expand});
    return exp => {
      const pipes = parsePipes(exp);
      return shortcuts.expand(null, pipes);
    };
  }
	
	it("basic", () => {
		const expand = prepare("test", "a.txt|tr:$1");
		assert.equal(expand("test:abc"), "a.txt|tr:abc");
	});
	
	it("multiple arguments", () => {
		const expand = prepare("test", "a.txt|tr:$1|tr2:$2");
		assert.equal(expand("test:abc,123"), "a.txt|tr:abc|tr2:123");
	});
	
	it("$&", () => {
		const expand = prepare("test", "a.txt|tr:$&");
		assert.equal(expand("test:abc,123"), "a.txt|tr:abc,123");
	});
	
	it("additional pipes", () => {
		const expand = prepare("test", "a.txt|tr");
		assert.equal(expand("test|tr2|tr3"), "a.txt|tr|tr2|tr3");
	});
  
  it("use function", () => {
    const expand = prepare("test", (source, a, b) => `a.txt|${a}|${b}`);
    assert.equal(expand("test:123,456"), "a.txt|123|456");
  });
});

describe("functional", () => {
  const {createInliner} = require("..");
  
  function mustFail() {
    throw new Error("Must fail");
  }
  
	it("maxDepth", () => {
    const inliner = createInliner();
    inliner.resource.add({
      name: "file",
      read: () => "$inline('foo')"
    });
    const target = {
      name: "file",
      args: ["foo"]
    };
    return inliner.inline(target)
      .then(mustFail)
      .catch(err => {
        assert(err.message.includes("Max recursion depth 10"));
      });
	});
	
	it("shortcut + transform", () => {
    const inliner = createInliner();
    const resource = {
      name: "file",
      read: sinon.spy((source, target) => {
        if (target.args[0] == "foo") {
          return `$inline.shortcut('foo', 'bar|t:$1')
$inline('foo:baz')`;
        }
        if (target.args[0] == "bar") {
          return "OK";
        }
        throw new Error(`unknown args: ${target.args}`);
      })
    };
    inliner.resource.add(resource);
    const transform = {
      name: "t",
      transform: sinon.spy((target, content, arg) => {
        return content + arg;
      })
    };
    inliner.transformer.add(transform);
    const target = {
      name: "file",
      args: ["foo"]
    };
    return inliner.inline(target)
      .then(({content}) => {
        assert.equal(content, `$inline.shortcut('foo', 'bar|t:$1')
OKbaz`);
      });
	});
});
