module.exports = function rawTextLoader(source) {
  return `export default ${JSON.stringify(source.toString())};`;
};
