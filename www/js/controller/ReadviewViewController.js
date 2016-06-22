/**
 * @author Jörn Kreutel
 * @author Benjamin Schmidt
 * @author Alex Preugschat
 */
define(["mwf","entities"], function(mwf, entities) {

    function ReadviewViewController() {
        console.log("ReadviewViewController()");

        // declare a variable for accessing the prototype object (used für super() calls)
        var proto = ReadviewViewController.prototype;
		var viewProxy;
		
        this.oncreate = function (callback) {
            // TODO: do databinding, set listeners, initialise the view
			var mediaItem = this.args.item;
			viewProxy = this.bindElement("mediaReadviewTemplate",{item:mediaItem},this.root).viewProxy;

			viewProxy.bindAction("deleteItem",function() {
				mediaItem.delete(function() {
					this.notifyListeners(new mwf.Event("crud","deleted","MediaItem",mediaItem._id));
				}.bind(this));
                this.previousView();
			}.bind(this));

            // eventlistener for deleting the mediaitem in editview
            this.addListener(new mwf.EventMatcher("crud","deleted","MediaItem"),function(event) {
                this.markAsObsolete();
                this.previousView();
            }.bind(this));

            // eventlistener for updating the mediaitem in editview
            this.addListener(new mwf.EventMatcher("crud","updated","MediaItem"),function(event) {
                viewProxy.update({item: mediaItem});
            }.bind(this));

            viewProxy.bindAction("editItem",function() {
                this.nextView("mediaEdit",{item:mediaItem});
            }.bind(this));

            // call the superclass once creation is done
            proto.oncreate.call(this,callback);
        }
    }

    // extend the view controller supertype
    mwf.xtends(ReadviewViewController,mwf.ViewController);

    // and return the view controller function
    return ReadviewViewController;
});
