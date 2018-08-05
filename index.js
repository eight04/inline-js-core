const {createShortcutExpander} = require("./lib/shortcut");
const {createResourceLoader} = require("./lib/resource");
const {createTransformer} = require("./lib/transformer");

const {parsePipes, parseText} = require("./lib/parser");

function createInliner({
  maxDepth = 10,
  resource = createResourceLoader(),
  transformer = createTransformer(),
  globalShortcuts = createShortcutExpander()
} = {}) {
  return {
    inline,
    resource,
    transformer,
    globalShortcuts,
    useConfig
  };
  
  function useConfig(conf) {
    if (!conf) {
      return;
    }
    if (conf.resources) {
      conf.resources.forEach(resource.add);
    }
    if (conf.transforms) {
      conf.transforms.forEach(transformer.add);
    }
    if (conf.shortcuts) {
      conf.shortcuts.forEach(globalShortcuts.add);
    }
  }
  
  async function inline({source, target, depth = 0, content}) {
    if (depth > maxDepth) {
      throw new Error(`Max recursion depth ${maxDepth} exceeded.`);
    }
    
    resource.resolve(source, target);
    const shortcuts = globalShortcuts.clone();
    if (!content) {
      content = await resource.read(source, target);
    }
    if (typeof content !== 'string') {
      return {
        content,
        target,
        children: []
      };
    }
    const parseResults = await Promise.all(parseText(content).map(inlineParseResult));
    return {
      target,
      content: joinContent(parseResults),
      children: parseResults.filter(r => r.target)
    };
      
    function inlineParseResult(result) {
      if (result.type === "text") {
        return {
          content: result.value
        };
      }
      if (result.type == "$inline.shortcut") {
        shortcuts.add({
          name: result.params[0],
          expand: result.params[1]
        });
        return {
          content: ""
        };
      }
      return inlineDirective(result);
    }
      
    function inlineDirective(directive) {
      let pipes = parsePipes(directive.params[0]);
      if (shortcuts.has(pipes[0].name)) {
        pipes = parsePipes(shortcuts.expand(target, pipes));
      }
      const inlineTarget = {
        name: pipes[0].args.length ? pipes[0].name : "file",
        args: pipes[0].args.length ? pipes[0].args : [pipes[0].name]
      };
      const transforms = pipes.slice(1);
      const transformContext = {
        source: target,
        sourceContent: content,
        inlineDirective: directive,
        inlineTarget
      };
      return inline({
        source: target,
        target: inlineTarget,
        depth: depth + 1
      })
        .then(inlineResult =>
          transformer.transform(
            transformContext,
            inlineResult.content,
            transforms
          )
            .then(content => {
              // use transformed content
              inlineResult.content = content;
              return inlineResult;
            })
        );
    }
  }

  function joinContent(resultArr) {
    if (resultArr.some(r => Buffer.isBuffer(r.content))) {
      return Buffer.concat(resultArr.map(r =>
        Buffer.isBuffer(r.content) ? r.content : Buffer.from(r.content, "binary")
      ));
    }
    return resultArr.map(r => r.content).join("");
  }
}

module.exports = {createInliner};
