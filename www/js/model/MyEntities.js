/**
 * @author Jörn Kreutel
 * @author Benjamin Schmidt
 * @author Alex Preugschat
 *
 * this skript defines the data types used by the application and the model operations for handling instances of the latter
 */

/*
 * a global counter for ids
 */
define(["mwfUtils", "EntityManager"], function (mwfUtils, EntityManager) {


    /*************
     * example entity
     *************/

    function MyEntity() {
        this.instantiateManagedAttributes();
    }

    // use EntityManager.xtends in order to add entity-specific behaviour
    EntityManager.xtends(MyEntity, EntityManager.Entity);

    // TODO-REPEATED: add new entity type declarations here
	function MediaItem(name,src,contentType,desc,contentProvision) {
		this.name = name;
		this.description = desc;
		this.added = Date.now();
		this.src = src;
		this.contentType = contentType;
		this.contentProvision = contentProvision;
		
		this.instantiateManagedAttributes();
	}
	EntityManager.xtends(MediaItem, EntityManager.Entity);
	
	Object.defineProperty(MediaItem.prototype, "addedDateString", {
		get: function () {
			return (new Date(this.added)).toLocaleDateString();
		}
	});
	
	Object.defineProperty(MediaItem.prototype, "mediaType", {
		get: function () {
			if (this.contentType) {
				var index = this.contentType.indexOf("/");
				if (index > -1) {
					return this.contentType.substring(0,index);
				} else {
					return "UNKNOWN";
				}
			} else {
				return "UNKNOWN";
			}
		}
	});

    // TODO-REPEATED: do not forget to export all type declarations
    return {
        MyEntity: MyEntity,
		MediaItem: MediaItem
    }

});
