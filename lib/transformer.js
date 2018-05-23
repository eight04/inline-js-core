function createTransformer() {
  const transformer = new Map;
  return {add, remove, transform};
  
  function add(transform) {
    transformer.set(transform.name, transform);
  }
  
  function remove(name) {
    transformer.delete(name);
  }
  
  function transform(context, content, transforms) {
    return transforms.reduce((pending, transform) => {
      return pending.then(content => {
        const t = transformer.get(transform.name);
        if (!t) {
          throw new Error(`Unknown transformer ${transform.name}`);
        }
        return t.transform(
          context,
          content,
          ...transform.args
        );
      });
    }, Promise.resolve(content));
  }
}

module.exports = {createTransformer};
