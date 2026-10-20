// Read canonical declarations without starting the app or touching user storage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),scope={t:value=>value};
vm.runInNewContext(html.slice(html.indexOf('var BASE_EX = ['),html.indexOf('var EN_NAME = {')),scope);
module.exports=Array.from(scope.BASE_EX);
