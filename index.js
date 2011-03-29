var fs = require('fs');
var url = require('url');
var path = require('path');
var gitteh = require('gitteh');

var GIT_DIR = '.git';

function setup(repoPath, options) {
  options = options || {};
  options.__proto__ = setup.DEFAULTS;

  // 'setup' can be synchronous...
  var isClone;
  try {
    isClone = fs.statSync(path.join(repoPath, GIT_DIR)).isDirectory();
  } catch(e) {
    if (e.code === 'ENOENT') {
      isClone = false;
    } else {
      throw e;
    }
  }
  if (isClone && repoPath.substring(repoPath.length-4) !== GIT_DIR) repoPath = path.join(repoPath, GIT_DIR);
  //console.log("Using repository:", repoPath, "isClone:", isClone);
  // Synchronously open the git repo
  var repo = gitteh.openRepository(repoPath);
  resolveHead(repo, console.log);

  return function gitProvider(req, res, next) {
    // Ensure that 'next()' exists (in the case of a plain http.Server)
    next = next || function() { res.writeHead(404); res.end("Not Found"); };

    if (!req.hasOwnProperty("uri")) { req.uri = url.parse(req.url); }
    if (req.uri.pathname.substring(0, options.mountPoint.length) !== options.mountPoint) return next();

    var gitPath = req.uri.pathname.substring(options.mountPoint.length);
    //console.log(gitPath);

    var parts = gitPath.split('/');
    if (parts[parts.length-1].length === 0) {
      parts[parts.length-1] = options.indexFile;
    }
    //console.log(parts);

    // The first part may be a commit reference, a git tag name, or just simply
    // the name of the file to server from a top-level.
    var firstPart = parts[0];
  }
}
module.exports = setup;

setup.DEFAULTS = {
  // The base request URL to serve from
  mountPoint: '/',
  // The name of the index file to serve when
  // a directory name is requested
  indexFile: 'index.html'
};


// Returns a Buffer of the specified file from the specified repo and commit reference.
function serveGitFile(repo, commit, filePath, callback) {

}


function resolveHead(repo, callback) {
  fs.readFile(path.join(repo.path, 'refs', 'heads', 'master'), function(err, commit) {
    if (err) return callback(err);
    callback(null, commit.toString().trim());
  });
}


function resolveTag(repo, tag, callback) {
  fs.readFile(path.join(repo.path, 'refs', 'tags', tag), function(err, commit) {
    if (err) return callback(err);
    callback(null, commit.toString().trim());
  });
}


function listTags(repo, callback) {
  fs.readdir(path.join(repo.path, 'refs', 'tags'), callback);
}
