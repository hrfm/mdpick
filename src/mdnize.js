var fs        = require('fs'),
    path      = require('path'),
    extend    = require('extend'),
    uncomment = require('./uncomment.js'),
    Logger    = require('./Logger.js');

module.exports = (function(){
    
    // --------------------------------------------------------------------------------------
    // --- Log utils.
    
    var logger = new Logger("mdnize");
    
    // --------------------------------------------------------------------------------------
    // --- Module.
    
	/**
	 * @class
     * @type {module.exports}
     */
    var mdnize = module.exports = function( options ){
        this.options = extend({
            "startSymbol"   : "md:",       // 開始文字列.
            "endSymbol"     : ":md",       // 終了文字列.
            "writeFileName" : true,        // ファイル名を出力するか. 文字列を指定した場合 その文字列を手前に差し込みます.
            "verbose"       : false        // 細かなログを出力するかどうか.
        },options);
    };
    
	/**
     * 取得対象を調べ Markdown 文字列を抜き出し,ファイルを出力します.
     * @param target    取得対象
     * @param dest      出力ファイル
     */
    mdnize.prototype.pick = function( target, dest ){
        var result = {};
        this._pick( target, ".", result );
        this._writeFile(dest,result);
    };
    
    // --- PRIVATE
    
	/**
	 * 取得対象を調べ Markdown 文字列を抜き出す処理の実際処理です.
     * 対象がディレクトリの場合は、子ディレクトリに対しても再帰的に行います.
     * 
     * @param target    Markdown 文字列の取得対象のパス.
     * @param dir       チェック中のディレクトリのパス.
     * @param obj       取得した内容を保存するための Object.
     * @private
     */
    mdnize.prototype._pick = function( target, dir, obj ){
        
        var uri  = path.resolve( dir + "/" + target );
        
        // --- stat を調べ ディレクトリとファイルで処理を切り分ける.
        
        var stat = fs.statSync(uri);
        if( stat.isDirectory() ){
            obj[target] = {};
            var list = fs.readdirSync(uri);
            for (var i = 0; i < list.length; i++) {
                this._pick( list[i], dir+"/"+target, obj[target] );
            }
        }else if( stat.isFile() ){
            var output = this._readFile(uri);
            if( output ){
                obj[target] = output;
            }
        }
        
    };

	/**
	 * ファイルを走査して Markdown を発見したらピックアップします.
     * 
     * @param uri
     * @returns {*}
     * @private
     */
    mdnize.prototype._readFile = function( uri ){
        
        var filename  = path.basename(uri);
        var extension = path.extname(uri);
        var basepath  = path.resolve(__dirname);

        //if( this.options.verbose ){
        //    logger.log([filename,extension,basepath].join(" "));
        //}
        
        // --- markdown ファイルは無視する.
        if( extension.toLowerCase() == ".md" ){
            return;
        }
        
        // ------------------------------------------------------------------------
        // --- Check Process Start.
        
        var picked  = [];
        var fileStr = fs.readFileSync(uri,'utf8').toString();
        var lines   = fileStr.split(/\r?\n/);
        
        if( this.options.verbose == true ){
            logger.log( "[Read] " + uri );
        }
        
        var uncmt = uncomment(extension);
        
        var pattern = [
            "^([ \\t]*"+uncmt+"[ \\t]*)",
            this.options.startSymbol+"(?:\\[(\\w+)\\])?",
            "(?:",
                "[ \\t]*(.+?)$",
            "|",
                "[\\r\\n]((?:.|\\r|\\n)+?)^[ \\t]*"+uncmt+"[ \\t]*"+this.options.endSymbol,
            ")"
        ];
        
        var regexp = new RegExp( pattern.join(""), "gm" );
        
        var execResult;
        while( execResult = regexp.exec(fileStr) ){

            var indents = execResult[1];
            var syntax  = execResult[2];
            var inline  = execResult[3];
            var body    = execResult[4];
            
            var output = "";
            if( inline ){
                output = inline;
            }else if( body ){
                if( indents && indents != "" ){
                    output += body.replace( new RegExp( "^" + indents.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&'), "gm" ), "" );
                }else{
                    output += body;
                }
            }
            if( syntax ){
                output = "```" + syntax + "\n" + output + "\n```";
            }
            picked.push( output );
            
            if( this.options.verbose ) {
                logger.log(output);
            }

        }
        
        // pick された行が1行以上ある場合に output に追加.
        if( 0 < picked.length ){
            if( this.options.verbose == true ){
                logger.log( "Pick from " + uri );
            }
            return picked.join("\r\n");
        }
        
        return null;
        
    }

	/**
	 * 結果をパースして文字列化する処理です.
     * @mdnize[xxx] の記述法を拡張するならここに記載する
     * 
     * @param result
     * @param output
     * @returns {*}
     * @private
     */
    mdnize.prototype._parseResult = function( result, map, nest ){
        
        for( var key in result ){
            
            var uri = nest.concat([key]).join("/");
            
            output = map[''];
            for( var pattern in map ){
                if( pattern != '' ){
                    regPattern = "^(\\.\\/)?" + pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    if( new RegExp(regPattern).test(uri) ){
                        if( this.options.verbose ){
                            logger.log( regPattern + " -> " + uri );
                        }
                        output = map[pattern];
                        break;
                    }
                }
            }
            
            var type = typeof result[key];
            switch( type ) {
                case "object" :
                    this._parseResult( result[key], map, nest.concat([key]) );
                    break;
                case "string" :
                    if( this.options.writeFileName === true ) {
                        output.push("## " + uri);
                    }else if( typeof this.options.writeFileName === "string" ){
                            output.push( this.options.writeFileName + " " + uri );
                    }else{
                        output.push( "<!-- " + uri + " -->" );
                    }
                    output.push( result[key] );
                    break;
            }
            
        }
        
        return map;
        
    }

	/**
     * 第一引数で指定した文字列の中に記載されている <!-- mdnize --> を元に
     * 第二引数で指定したオブジェクトのキーと照らし合わせ, マッチしたものを置換します.
     * 
     * @param str
     * @param map
     * @private
     */
    mdnize.prototype._createBuffer = function( str, map ){
        
        for( var key in map ){
            
            var open, regexp;
            
            if( key == "" ){
                open   = "<!-- mdnize: -->";
                regexp = /<!\-\-\smdnize:\s\-\->((.|\r|\n)+?)<!\-\-\s:mdnize\s\-\->/mg;
            }else{
                open   = "<!-- mdnize["+key+"]: -->";
                regexp = new RegExp("<!\\-\\-\\smdnize\\["+key+"\\]:\\s\\-\\->((.|\\r|\\n)+?)<!\\-\\-\\s:mdnize\\s\\-\\->","mg");
            }
            open += "\r\n\r\n";
            
            str = str.replace( regexp, open + map[key].join("\r\n\r\n") + "\r\n\r\n<!-- :mdnize -->");
            
        }
        
        return new Buffer(str);
        
    }
    
	/**
	 * ピックアップされた Markdown のデータの構造を元に、出力先ファイルの記述に応じて Markdown 文字列を出力します.
     * 
     * @param dest      出力先ファイル
     * @param result    ピックアップ結果
     * @private
     */
    mdnize.prototype._writeFile = function( dest, result ){
        
        if( typeof this.options.base === "undefined" ){
            this.options.base = "README.md";
        }
        
        var destString = "";
        var destStringMap = { "":[] };
        
        try{
            
            destString = fs.readFileSync( path.resolve( ".", dest ) ).toString();
            
            // --- 出力対象のファイル内に <!-- @mdnize --> があるかを調べる.
            
            var reg = /<!\-\-\smdnize\[?([\d\w\-._ /]*)\]?:\s\-\->((.|\r|\n)+?)<!\-\-\s:mdnize\s\-\->/mg;
            var matches = destString.match(reg);
            
            if( matches ){
                
                // --- <!-- @mdnize --> に [] でファイル指定があるかを調べる. あればそこはそのファイル or ディレクトリ以下を出力するように準備する. なければ 全てを <!-- @mdnize --> 内に書く
                
                var reg2 = /<!\-\-\smdnize\[?([\d\w\-._ /]*)\]?:\s\-\->/;
                for( var i=0; i<matches.length; i++ ){
                    var target = matches[i].match(reg2)[1];
                    if( !destStringMap[target] ){
                        destStringMap[target] = [];
                    }
                }
                
            }else{
                
                destString += "<!-- mdnize: -->\n\n<!-- :mdnize -->";
                
            }
            
        }catch(e){}
        
        if( destString == "" ) {
            destString = "<!-- mdnize: -->\n\n<!-- :mdnize -->";
        }
        
        var parsedResult = this._parseResult( result, destStringMap,[] );
        
        if( this.options.verbose )
        {
            logger.log( "Start parse result object..." );
            logger.log( result );
            logger.log( "---------------" );
            logger.log( parsedResult );
        }
        
        var buffer = this._createBuffer( destString, parsedResult );
        if( buffer ){
            fs.writeFile( path.resolve( ".", dest ), buffer.toString() );
        }
        
    }
    
    return mdnize;
    
}).call(this);