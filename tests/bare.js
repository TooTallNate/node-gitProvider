require('http').createServer(
  require('../')(__dirname + '/fixtures/bare.git')
).listen(3000);
