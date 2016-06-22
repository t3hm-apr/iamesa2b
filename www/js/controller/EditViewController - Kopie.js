/**
 * @author Benjamin Schmidt
 * @author Alex Preugschat
 */
define(["mwf","entities"], function(mwf, entities) {
    function EditViewController() {

        // declare a variable for accessing the prototype object (used für super() calls)
        var proto = EditViewController.prototype;
        var viewProxy;
        /*
         * for any view: initialise the view
         */
        this.oncreate = function (callback) {
            var mediaItem = this.args.item;
            viewProxy = this.bindElement("mediaEditTemplate",{item:mediaItem},this.root).viewProxy;
            
            viewProxy.bindAction("deleteItem",function() {
                mediaItem.delete(function() {
                    this.notifyListeners(new mwf.Event("crud","deleted","MediaItem",mediaItem._id));
                }.bind(this));
                this.previousView();
            }.bind(this));

            viewProxy.bindAction("onsubmit",function(event) {
                event.original.preventDefault();
                if(mediaItem._id == -2) {
                    mediaItem.create(function(){
                        this.notifyListeners(new mwf.Event("crud","created","MediaItem",mediaItem._id));
                    }.bind(this));
                    this.previousView();
                } else {
                    mediaItem.update(function(){
                        this.notifyListeners(new mwf.Event("crud","updated","MediaItem",mediaItem._id));
                    }.bind(this));
                    this.previousView();
                }
            }.bind(this));

            // call the superclass once creation is done
            proto.oncreate.call(this,callback);
            if(mediaItem.src != "") {
                document.getElementById("previewImg").src = mediaItem.src;
            } else {
                document.getElementById("previewImg").src = "img/placeholder.gif";
            }

        }
    }

    // extend the view controller supertype
    mwf.xtends(EditViewController,mwf.ViewController);

    // and return the view controller function
    return EditViewController;
});