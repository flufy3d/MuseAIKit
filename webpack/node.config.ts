import * as path from 'path';
import * as webpack from 'webpack';
import * as nodeExternals from 'webpack-node-externals';
import {baseConfig} from './es6.base.config';

module.exports = {
  ...baseConfig,
  target: 'node',  // 明确指定目标环境为node
  node: {
    __dirname: false,  // 禁用webpack对__dirname的处理
    __filename: false  // 禁用webpack对__filename的处理
  },
  module: {
    rules: [{
      test: /\.ts$/,
      exclude: /node_modules/,
      use: {
        loader: 'ts-loader',
        options: {
          configFile: 'tsconfig.es6.json',
          compilerOptions: {outDir: './node'}
        }
      }
    }],
  },
  output: {
    filename: '[name].js',
    chunkFilename: '_lib/[name].js',
    library: 'mm',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, '../node'),
    globalObject: 'this'  // 修改为'this'以兼容node环境
  },
  externals: [nodeExternals()],  // 将externals改为数组形式
  plugins: [
    new webpack.NormalModuleReplacementPlugin(
      /\/core\/compat\/global\.ts/,
      path.resolve(__dirname, '../src/core/compat/global_node.ts')
    ),
  ]
};
