const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

module.exports = function(creator, options, callback) {
  const { name, description } = options;

  // 获取当前命令的执行目录，注意和项目目录区分
  const cwd = process.cwd();
  // 项目目录
  const projectPath = path.join(cwd, name);
  const srcPath = path.join(projectPath, 'src');
  const distPath = path.join(projectPath, 'dist');


  // 新建项目目录
  // 同步创建目录，以免文件目录不对齐
  fs.mkdirSync(projectPath);
  fs.mkdirSync(srcPath);
  fs.mkdirSync(distPath);

  creator.copyTpl('packagejson', path.join(projectPath, 'package.json'), {
    name,
    description,
  });

  creator.copy('dist/.gitkeep', path.join(distPath, '.gitkeep'));
  creator.copy('src/main.js', path.join(srcPath, 'main.js'));
  creator.copy('src/App.vue', path.join(srcPath, 'App.vue'));
  creator.copy('index.html', path.join(projectPath, 'index.html'));
  creator.copy('.babelrc', path.join(projectPath, '.babelrc'));

  creator.fs.commit(() => {
    console.log();
    console.log(`${chalk.grey(`创建项目: ${name}`)} ${chalk.green('✔ ')}`);

    callback();
  });
}
