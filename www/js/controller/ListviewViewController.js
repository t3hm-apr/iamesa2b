/**
 * @author Jörn Kreutel
 * @author Benjamin Schmidt
 * @author Alex Preugschat
 */
define(["mwf","entities"], function(mwf, entities) {

    function ListviewViewController() {
        console.log("ListviewViewController()");

        // declare a variable for accessing the prototype object (used für super() calls)
        var proto = ListviewViewController.prototype;
		
		var items = [
			new entities.MediaItem("m1","","","URL"),
			new entities.MediaItem("m2","","","URL"),
			new entities.MediaItem("m3","","","URL")
		];

        /*
         * for any view: initialise the view
         */
		var addNewMediaItemElement;
		var resetDatabaseElement;
		
        this.oncreate = function (callback) {
            // TODO: do databinding, set listeners, initialise the view
			addNewMediaItemElement = this.root.querySelector("#addNewMediaItem");
			resetDatabaseElement = this.root.querySelector("#resetDatabase");
			
			addNewMediaItemElement.onclick = function() {
				this.createNewItem();
			}.bind(this);
			
			resetDatabaseElement.onclick = function() {
				if (confirm("Soll die Datenbank wirklich zurückgesetzt werden?")) {
					indexedDB.deleteDatabase("mwftutdb");
				}
			}.bind(this);
			
			entities.MediaItem.readAll(function(items) {
				this.initialiseListview(items);
			}.bind(this));
			
			
			this.addListener(new mwf.EventMatcher("crud","created","MediaItem"),function(event) {
				this.addToListview(event.data);
			}.bind(this));
			
			this.addListener(new mwf.EventMatcher("crud","updated","MediaItem"),function(event) {
				this.updateInListview(event.data._id,event.data);
			}.bind(this));
			
			this.addListener(new mwf.EventMatcher("crud","deleted","MediaItem"),function(event) {
				this.removeFromListview(event.data);
			}.bind(this));
			
			this.initialiseListview(items);

            // call the superclass once creation is done
            proto.oncreate.call(this,callback);
        }

        /*
         * for views with listviews: bind a list item to an item view
         * TODO: delete if no listview is used or if databinding uses ractive templates
         */
		
        /*
         * for views with listviews: react to the selection of a listitem
         * TODO: delete if no listview is used or if item selection is specified by targetview/targetaction
         */
        this.onListItemSelected = function(listitem,listview) {
            // TODO: implement how selection of listitem shall be handled
			//alert("Element " + listitem.name+listitem._id + " wurde ausgewählt!");
			this.nextView("mediaReadview",{item:listitem});
        };

        /*
         * for views with listviews: react to the selection of a listitem menu option
         * TODO: delete if no listview is used or if item selection is specified by targetview/targetaction
         */
        this.onListItemMenuItemSelected = function(option, listitem, listview) {
            // TODO: implement how selection of option for listitem shall be handled
			proto.onListItemMenuItemSelected.call(this, option, listitem, listview);
        };

        /*
         * for views with dialogs
         * TODO: delete if no dialogs are used or if generic controller for dialogs is employed
         */
        this.bindDialog = function(dialogid,dialog,item) {
            // call the supertype function
            proto.bindDialog.call(this,dialogid,dialog,item);
            // TODO: implement action bindings for dialog, accessing dialog.root
        };

		this.deleteItem = function(item) {
			item.delete(function(){
				//this.removeFromListview(item._id);
			}.bind(this));
		};
		
		this.onReturnFromSubview = function(subviewid,returnValue,returnStatus,callback) {
			if (subviewid == "mediaReadview" && returnValue && returnValue.deletedItem) {
				this.removeFromListview(returnValue.deletedItem. id);
			}
			callback();
		};

		this.editItem = function(item) {
			this.nextView("mediaEdit",{item:item});
		};
		
		this.createNewItem = function(item) {
			var newItem = new entities.MediaItem("","","","","URL");
			this.nextView("mediaEdit",{item:newItem});
		}
	}
    // extend the view controller supertype
    mwf.xtends(ListviewViewController,mwf.ViewController);

    // and return the view controller function
    return ListviewViewController;
});
