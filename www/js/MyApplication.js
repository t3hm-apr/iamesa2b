/**
 * Created by master on 17.02.16.
 */
define(["mwf","mwfUtils","EntityManager","entities","GenericCRUDImplLocal","GenericCRUDImplRemote"],function(mwf,mwfUtils,EntityManager,entities,GenericCRUDImplLocal,GenericCRUDImplRemote){

    function MyApplication() {

        var proto = MyApplication.prototype;

        this.oncreate = function(callback) {
            // check if the server is available
            ifServerOnline(
                function() {
                    //  server online code here
                    serverOnline = true;
                },
                function () {
                    //  server offline code here
                    serverOnline = false;
                }
            );
            console.log("MyApplication.oncreate(): calling supertype oncreate");

            // first call the supertype method and pass a callback
            proto.oncreate.call(this,function() {

                // initialise the local database
                // TODO-REPEATED: add new entity types to the array of object store names
                GenericCRUDImplLocal.initialiseDB("mwftutdb", 1, ["MyEntity","MediaItem"], function () {

                    //// TODO-REPEATED: if entity manager is used, register entities and crud operations for the entity types
                    //this.registerEntity("MyEntity", entities.MyEntity, true);
                    //this.registerCRUD("MyEntity", this.CRUDOPS.LOCAL, GenericCRUDImplLocal.newInstance("MyEntity"));
                    //this.registerCRUD("MyEntity", this.CRUDOPS.REMOTE, GenericCRUDImplRemote.newInstance("MyEntity"));

                    // TODO: do any further application specific initialisations here
					this.registerEntity("MediaItem", entities.MediaItem, true);
					this.registerCRUD("MediaItem", this.CRUDOPS.LOCAL, GenericCRUDImplLocal.newInstance("MediaItem"));
                    this.registerCRUD("MediaItem", this.CRUDOPS.REMOTE, GenericCRUDImplRemote.newInstance("MediaItem"));
                    if(serverOnline) {
                        this.initialiseCRUD(this.CRUDOPS.LOCAL,EntityManager);
                    } else {
                        this.initialiseCRUD(this.CRUDOPS.REMOTE,EntityManager);
                    }

                    // THIS MUST NOT BE FORGOTTEN: initialise the entity manager!
                    EntityManager.initialise();

                    // do not forget to call the callback
                    callback();
                }.bind(this));


            }.bind(this));

        }

    }

    mwf.xtends(MyApplication,mwf.Application);

    var instance = new MyApplication();

    return instance;

});