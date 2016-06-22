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
                var clickedElement = event.node.id;
                if(clickedElement == "radioUrl") {
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
                } else {
                    var self = this;
                    var formdata = new FormData();
                    formdata.append("src", editform.itemFile.files[0]);
                    formdata.append("name", editform.mediaItemTitle.value);
                    formdata.append("desc", editform.mediaItemDesc.value);

                    var xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState == 4) {
                            if (xhr.status == 200) {
                                var responseObj = JSON.parse(xhr.responseText).data;
                                console.log(responseObj);
                                var mediaItem = new entities.MediaItem(responseObj.name,responseObj.src,responseObj.contentType,responseObj.desc,"FILE");
                                mediaItem.create(function(){
                                    self.notifyListeners(new mwf.Event("crud","created","MediaItem",mediaItem._id));
                                }.bind(self));
                                self.previousView();
                            }
                        }
                    };
                    xhr.open("POST", "http2mdb/www/content/formdata");
                    xhr.send(formdata);
                }


            }.bind(this));

            viewProxy.bindAction("MultipartResponse", function(){
               alert("HIHI");
            });

            // action if the radiobutton is checked
            // hidde the not needed elemtent and mark url as required if it is checked
            viewProxy.bindAction("radioCheck",function(event) {
                var clickedElement = event.node.id;
                if(clickedElement == "radioUrl") {
                    document.getElementById("itemURL").className = "";
                    document.getElementById("itemURL").required = true;
                    document.getElementById("itemURL").disabled = false;
                    document.getElementById("itemFile").className = "hiddenFileType";
                } else {
                    document.getElementById("itemURL").className = "hiddenFileType";
                    document.getElementById("itemURL").required = false;
                    document.getElementById("itemURL").disabled = true;
                    document.getElementById("itemFile").className = "";
                }
            });

            // call the superclass once creation is done
            proto.oncreate.call(this,callback);

            // work to do after the call of the superclass

            // if new mediaitem set a placeholder image
            if(mediaItem.src != "") {
                document.getElementById("previewImg").src = mediaItem.src;
            } else {
                document.getElementById("previewImg").src = "content/img/placeholder.gif";
            }

            // if the mediaitem from type url or it is new set the radiobutton url on checked
            if(this.application.currentCRUDScope == 'local') {
                document.getElementById("radioUrl").checked="checked";
                document.getElementById("radioFile").disabled = true;
            } else {
                if(mediaItem.contentProvision=="URL" || mediaItem._id == -2) {
                    document.getElementById("radioUrl").checked="checked";
                } else {
                    document.getElementById("radioFile").checked="checked";
                }
            }
        }
    }

    // extend the view controller supertype
    mwf.xtends(EditViewController,mwf.ViewController);

    // and return the view controller function
    return EditViewController;
});