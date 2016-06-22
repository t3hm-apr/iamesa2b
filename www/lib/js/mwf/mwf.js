/**
 * @author Jörn Kreutel
 */
// this is the root object of the runtime execution

// TODO: reset viewcontroller stack on mainMenu action!? or alternatively allow resuming a "thread" by retrieving an active controller based on the selection id
// TODO: identify listviews by data-mwf-id rather than by id?
// TODO: allow to switch off mwf.stringify() for performance optimisation!
define([ "mwfUtils","eventhandling","EntityManager"], function ( mwfUtils, eventhandling, EntityManager) {

    console.log("loading module...");

    var applicationState;

    var applicationResources;

    var applicationObj;

    // constants for lifecycle functions
    var CONSTANTS = {
        // lifycycle constants
        LIFECYCLE: {
            CONSTRUCTED: "CONSTRUCTED",
            CREATED: "CREATED",
            SHOWING: "SHOWING",
            PAUSED: "PAUSED",
            STOPPED: "STOPPED",
            // introduce obslete status, which will result in skipping resume when returning to some view controller
            OBSOLETE: "OBSOLETE"
        }
    }

    // some global storage
    var GLOBAL = new Object();

    function ApplicationState() {
        console.log("ApplicationState()");

        // the list of view controllers that is currently active and is managed by the application stack
        var activeViewControllers = new Array();

        // the list of embedded view controllers that is not managed by the navigation stack (currently this is used for the sidemenu) - they are singletons and will be managed as a map, where keys are the ids of their view elements!
        // embedded controllers dealt with at application state level will be notified once navigation stack manipulation occurs in order to allow (re-)attachment to a new view (also this is used for the sidemenu vc)
        var embeddedViewControllers = new Object();

        // push a view controller to the list of active controllers
        this.pushViewController = function (vc) {
            console.log("pushing view controller: " + vc + " onto list of " + activeViewControllers.length + " active controllers...");
            // we invoke pause on the current last element
            if (activeViewControllers.length != 0) {
                var currentViewVC = activeViewControllers[activeViewControllers.length - 1];
                console.log("pausing view controller: " + currentViewVC);

                // while oncreate is running on the new view controller the current view is still visible. Only once oncreate is finished we will exchange the views
                activeViewControllers.push(vc);

                vc.oncreate(function () {
                    // we attach the embedded controllers once creation is done
                    reattachEmbeddedControllers(vc);
                    currentViewVC.onpause(function () {
                        vc.onresume(function () {
                        });
                    });
                });

            } else {
                reattachEmbeddedControllers(vc);

                activeViewControllers.push(vc);
                vc.oncreate(function () {
                    vc.onresume(function () {
                    });
                });
            }
        }
        // remove the active view controller
        this.popViewController = function (returnData, returnStatus) {
            var vc = activeViewControllers.pop();
            console.log("popped view controller: " + vc.root.id + ". Will call onpause+onstop");
            // we first pause and then stop
            vc.onpause(function () {
                // we invoke the onstop method on the vc
                vc.onstop(function () {
                    // then we check whether we have a current view controller and invoke onresume(); - unless it is obsolete
                    if (activeViewControllers.length != 0) {
                        var currentViewVC = activeViewControllers[activeViewControllers.length - 1];

                        if (currentViewVC.lcstatus == CONSTANTS.LIFECYCLE.OBSOLETE) {
                            console.info("current view controller " + currentViewVC.root.id + " is obsolete. Pop it...");
                            // we do not pass returnData or status
                            this.popViewController({obsoleted: true},-1);
                        }
                        else {
                            // here, we reattach the embedded controllers
                            reattachEmbeddedControllers(currentViewVC);

                            if (currentViewVC.onReturnFromSubview) {
                                currentViewVC.onReturnFromSubview(vc.root.id, returnData, returnStatus, function () {
                                    currentViewVC.onresume(function () {
                                    });
                                });
                            } else {
                                currentViewVC.onresume(function () {
                                });
                            }
                        }
                    }
                }.bind(this));
            }.bind(this));
        }

        this.clearControllers = function (callback) {
            var countdown = parseInt(activeViewControllers.length);
            var totalCount = parseInt(activeViewControllers.length);
            console.log("countdown is: " + countdown);

            for (var i = 0; i < totalCount; i++) {
                var vc = activeViewControllers.pop();
                console.log("popped vc: " + vc);
                if (vc) {
                    console.log("popped view controller: " + vc.root.id + ". Will call onstop");
                    vc.onstop(function () {
                        countdown--;
                        if (countdown == 0) {
                            console.log("no active view controllers left. Now call the callback from " + vc.root.id);
                            callback.call(this, vc.root.id);
                        }
                        else {
                            console.log("countdown is greaterorequal than one: " + countdown);
                        }
                    }.bind(this));
                }
                else {
                    console.log("no vc can be found!");
                }
            }
        }

        this.addEmbeddedController = function (vc) {
            console.log("adding top level embedded view controller: " + JSON.stringify(vc));

            // check whether an id is specified, otherwise use the data-mwf-templatename as identifier
            if (vc.root.id) {
                embeddedViewControllers[vc.root.id] = vc;
            }
            else if (vc.root.hasAttribute("data-mwf-templatename")) {
                embeddedViewControllers[vc.root.getAttribute("data-mwf-templatename")] = vc;
            }
            else {
                console.error("embedded controller neither specifies an id, nor a data-mwf-templatename. How shall it be identified?");
            }
        }

        function reattachEmbeddedControllers(vc) {
            console.log("reattachEmbeddedControllers()");

            for (var ctrlid in embeddedViewControllers) {
                var ctrl = embeddedViewControllers[ctrlid];
                if (ctrl.mwfAttaching) {
                    console.log("attaching/detaching embeddable view controller: " + ctrlid);
                    ctrl.detachFromView();
                    ctrl.attachToView(vc.root);
                }
                else {
                    console.log("embeddable view controller is not attaching: " + ctrl);
                }
            }
        }

        this.getEmbeddedController = function(ctrlid) {
            return embeddedViewControllers[ctrlid];
        }

    }

    /*
     * generic view controller implementation
     */
    function ViewController() {

        this.lcstatus = CONSTANTS.LIFECYCLE.CONSTRUCTED;

        this.pendingEventListeners = new Array();

        // the root of our view
        this.root = null;
        // the args that we are using
        this.args = null;
        // hold a dialog
        this.dialog = null;

        // we may manage multiple listview adapters (see e.g. search results in spotify)
        this.listviewAdapters = new Object();

        // if we have an actionmenu this attribute contains a map from menu item ids to the dom elements that represent the item - note that manipulation of this list is not possible - if new items shall be added, it needs to be done via onPrepareActionmenu
        // maybe this should be removed...
        this.actionmenuItems;

    }

    /*
     * an event listener that hides all overlay elements - we need to declare it like this in order to be able to access it from the lifecycle functions
     * it will be added oncreate and onresune, and removed onpause and onstop
     */
    ViewController.prototype.hideOverlays = function () {
        console.log("hideOverlays(): " + this.root);
        // on nextview we need to hide anything that is dialog
        hideMenusAndDialogs.call(this);
    }

    /*
     * inheritable and overridable prototype functions (instance methods) of ViewController
     *
     * notice the reference from prototype functions to instance attributes via this - this allows for each subclass instace to inherit the functions while accessing their own attributes
     */
    ViewController.prototype.setViewAndArgs = function (_view, _args) {
        console.log("ViewController.setViewAndArgs(): " + _view.id);
        console.log("ViewController.setViewAndArgs() view: " + _view + ", args: " + (_args ? mwfUtils.stringify(_args) : " no args"));

        this.root = _view;
        this.args = _args;

    }

    /*
     * if the view has already been set (e.g. for dialogs), args can be passed
     */
    ViewController.prototype.setArgs = function (_args) {
        console.log("ViewController.setArgs(): id: " + this.root.id);
        console.log("ViewController.setArgs(): args: " + (_args ? mwfUtils.stringify(_args) : " no args"));

        this.args = _args;
    }

    // this function is not publicly exposed
    function prepareActionmenu() {
        console.log("prepareActionmenu()");
        // initialise the actionmenu if one exists
        var actionmenuControl = this.root.getElementsByClassName("mwf-actionmenu-control");
        var actionmenu = this.root.getElementsByClassName("mwf-actionmenu");
        if (actionmenuControl.length > 0) {
            actionmenuControl = actionmenuControl[0];
            actionmenu = actionmenu[0];

            /*
             * control opening and closing the menu
             */
            actionmenuControl.onclick = function (event) {
                // we do not propagate it upwards...
                event.stopPropagation();
                // if the menu is not expanded prenventionally close a sidemenu if one exists
                if (!actionmenu.classList.contains("mwf-expanded")) {
                    hideMenusAndDialogs.call(this);
                    this.onPrepareActionmenu(actionmenu, function (actionmenu) {
                        actionmenu.removeEventListener("click", cancelClickPropagation);
                        actionmenu.addEventListener("click", cancelClickPropagation);
                        actionmenu.classList.toggle("mwf-expanded");
                    }.bind(this));
                }
                else {
                    actionmenu.classList.remove("mwf-expanded");
                }
            }.bind(this);

            /*
             * update the local representation of the actionmenuItems and set listeners on the menu items
             */
            this.updateActionmenuItems(actionmenu);
            for (var itemid in this.actionmenuItems) {
                // set listener
                this.actionmenuItems[itemid].onclick = function (event) {
                    // inside the event handler we MUST NOT use the expression this.actionmenuItems[itemid] because it will always point to the last element in the list...
                    // TODO: we could let the item control whether the menu shall be closed or not (closing is default, as then the click event bubbles upwards)
                    if (event.currentTarget.classList.contains("mwf-menu-item")) {
                        this.onActionmenuItemSelected(event.currentTarget);
                    }
                }.bind(this);
            }
        }

    }

    /* this is for initialising generic listview funcitonality */
    function prepareListviews() {
        console.log("prepareListviews()");
        // read out listviews (! we might have more than a single listview, see e.g. types search results in spotify etc.)
        var listviews = this.root.getElementsByClassName("mwf-listview");
        if (listviews.length == 0) {
            console.log("prepareListviews(): view " + this.root.id + " does not use listviews");
        }
        else if (this.listviewsPrepared) {
            console.warn("prepareListviews(): views seem to have been prepared already for " + this.root.id + ". Ignore call...");
        }
        else {
            console.log("prepareListviews(): found " + listviews.length + " listviews");

            // this is the listview selection handler that both covers item selection and item menu selection - note that we use a single function that will handle all listviews (if there exists more than one)
            var listviewSelectionListener = function (event) {

                // ignore the list selection if there is any overlay shown
                // TODO: these checks should be implemented in a less resource consuming way...
                if (document.querySelector(".mwf-listitem-menu.mwf-shown") || document.querySelector(".mwf-sidemenu.mwf-expanded") || document.querySelector(".mwf-actionmenu.mwf-expanded") || document.querySelector(".mwf-dialog.mwf-shown")) {
                    console.log("ignore list item selection. There is an active dialog!");
                    return;
                }

                // we need to recursively look up the potential targets that are interesting for us, we always collect the listitem and the listview
                function lookupTarget(currentNode, eventData) {
                    // using templating, lookup does not work because there are cycles...
                    //console.log("lookupTarget(): " + JSON.stringify(eventData));

                    // if we have reached the listview, the event is not of interest for us
                    if (currentNode.classList.contains("mwf-listview")) {
                        if (!eventData) {
                            console.log("got click/touch event on listview, but neither a listitem, nor a listitem menu seems to have been selected");
                        }
                        else {
                            eventData.listview = currentNode;
                        }
                    }
                    // if we have reached the menu control, we need to move upwards because we still need to find out which item is meant
                    else if (currentNode.classList.contains("mwf-listitem-menu-control")) {
                        if (!eventData) {
                            eventData = {};
                        }
                        console.log("found a listitem-menu in listview event");
                        eventData.eventType = "itemMenuSelected";
                        eventData = lookupTarget(currentNode.parentNode, eventData);
                    }
                    else if (currentNode.classList.contains("mwf-listitem")) {
                        console.log("found a listitem in listview event");
                        if (!eventData) {
                            eventData = {};
                        }
                        else if (!eventData.eventType) {
                            eventData.eventType = "itemSelected";
                            console.log("listview event is item selection");
                        }
                        // here we set the item
                        eventData.listitem = currentNode;
                        eventData = lookupTarget(currentNode.parentNode, eventData);
                    }
                    else {
                        eventData = lookupTarget(currentNode.parentNode, eventData);
                    }

                    return eventData;
                }

                // we lookup the target
                var eventData = lookupTarget(event.target);

                //console.log("loopupTarget(): result is: " + (eventData ? JSON.stringify(eventData) : " no target found!"));

                if (eventData) {
                    event.stopPropagation();
                    mwfUtils.removeTouch(eventData.listitem);

                    // if we have an itemMenuSelected event we stop propagation - otherwise a itemSelection event will be triggered
                    if (eventData.eventType == "itemMenuSelected") {
                        this.onListItemMenuSelected(eventData.listitem, eventData.listview);
                    }
                    else {
                        this.onListItemElementSelected(eventData.listitem, eventData.listview);
                    }
                }

            }.bind(this);

            // we set it on all listviews
            for (var i = 0; i < listviews.length; i++) {
                // we add the listview under its id (not mwf-id!) to the listviews map
                this.listviewAdapters[listviews[i].id] = new ListviewAdapter(listviews[i], this, applicationResources);
                listviews[i].onclick = listviewSelectionListener;
            }

            this.listviewsPrepared = true;

        }
    }

    /*
     * implements default behaviour for actionmenu. subtypes might override the function to cover behaviour that is not dealt with generically here
     */
    ViewController.prototype.onActionmenuItemSelected = function (item) {
        if (item.classList.contains("mwf-disabled")) {
            console.log("ViewController.onActionmenuItemSelected(): action is disabled!");
        }
        else {
            console.log("ViewController.onActionmenuItemSelected(): " + item);
            // check whether the menu item has a data-mwf-targetview or data-mwf-targetaction attribute
            if (item.hasAttribute("data-mwf-targetview")) {
                var targetview = item.getAttribute("data-mwf-targetview")
                console.log("ViewController.onActionmenuItemSelected(): item specifies a targetview: " + targetview);
                this.nextView(targetview);
            }
            else if (item.hasAttribute("data-mwf-targetaction")) {
                var targetaction = item.getAttribute("data-mwf-targetaction");
                console.log("ViewController.onActionmenuItemSelected(): item specifies a targetaction: " + targetaction)
                // we invoke the function dynamically - TODO: need to check how this can be done more elegantly than using eval
                var targetactionfunction = "this." + targetaction + "()";
                eval(targetactionfunction);
            }
            else {
                alert("Cannot handle actionmenu item with mwf-id: " + item.getAttribute("data-mwf-id") + "! Remove the item or override onActionmenuItemSelected locally!");
            }
        }
    }


    /*
     * allows subtypes to react to itemMenu selection - this is the default implementation that uses the mwf-listitem-menu attribute
     */
    ViewController.prototype.onListItemMenuSelected = function (listitem, listview) {
        console.log("ViewController.onListItemMenuSelected(): " + listitem + "." + listitem.getAttribute("data-mwf-id") + " from " + listview);
        var listitemMenuId = listview.getAttribute("data-mwf-listitem-menu");
        if (!listitemMenuId) {
            console.log("onListItemMenuSelected(): no listItemMenuId is specified. If listitem menu selection shall be handled, this function needs to be overridden");
        }
        else {
            var menuElement = null;
            // check whether the menu is a template, in which case it will be cloned
            // TODO: apply this logics also to "normal" dialogs!
            if (applicationResources.hasTemplate(listitemMenuId)) {
                menuElement = this.getTemplateInstance(listitemMenuId);
            }
            else {
                menuElement = document.getElementById(listitemMenuId);
            }
            //mwfUtils.feedbackTouchOnElement(menuElement);

            // TODO: we could also use data binding for the list item menu...
            if (!menuElement.tagName) {
                // check whether we have mwf-databind active
                if (menuElement.root.classList.contains("mwf-databind")) {
                    // note that item is a dom element and not the item object
                    var itemObj = this.readFromListview(listitem.getAttribute("data-mwf-id"));
                    applyDatabinding(menuElement.root, menuElement.body, itemObj);
                }
                menuElement = menuElement.root;
            }

            console.log("using listitemMenu: " + menuElement);

            // we allow subclasses to prepare the menu for the given item - this is done asynchronously in case some background processig needs to be done
            this.onPrepareListitemMenu(menuElement, listitem, listview, function (preparedMenu) {

                // we set a listener on the menu element that listens to list item selection - TODO: also realise the one-listener solution for the other menus (sidemnu, actionmenu)
                var listitemMenuItemSelectedListener = function (event) {

                    this.hideDialog();

                    function lookupTarget(node) {
                        if (node.classList.contains("mwf-listitem-menu")) {
                            console.log("we already reached the root of the menu. Click does not seem to have selected a menu item...");
                            return null;
                        }
                        else if (node.classList.contains("mwf-menu-item")) {
                            return node;
                        }
                        else {
                            return lookupTarget(node.parentNode);
                        }
                    }

                    var targetItem = lookupTarget(event.target);
                    if (targetItem) {
                        // we feedback which menu item for which item of which listview has been selected...
                        this.onListItemMenuItemSelected(targetItem, listitem, listview);
                    }

                }.bind(this);

                console.log("setting menuItemSelectedListener on: " + preparedMenu);

                // set the listener on the menu
                preparedMenu.addEventListener("click", listitemMenuItemSelectedListener);

                // we will show the menu as a dialog
                this.showDialog(preparedMenu, function () {
                    console.log("listitem menu is shown as dialog...");
                });

            }.bind(this));
        }
    }

    /* in the default case we just pass the menu without changes to the dialog - for the user, however, it would be nice for the dialog to give feedback about the id of the selected item. In this case, subtypes must override this function */
    ViewController.prototype.onPrepareListitemMenu = function (menu, item, list, callback) {
        callback(menu);
    }

    /*
     * allows subtypes to react to item selection: we may react to the selection of the view element, but provide a default that does some standard handling
     */
    ViewController.prototype.onListItemElementSelected = function (listitemEl, listview) {
        console.log("ViewController.onListItemElementSelected(): " + listitemEl + " from " + listview);
        var itemId = listitemEl.getAttribute("data-mwf-id");
        mwfUtils.removeTouch(listitemEl);
        console.log("ViewController.onListItemElementSelected(): itemId is: " + itemId);

        var itemObj = this.readFromListview(itemId,listview.id);
        if (!itemObj) {
            console.error("ViewController.onListItemElementSelected(): item with selected id " + itemId + " not found in list!");
        }
        else {
            // this handling could be generalised!
            var targetview = listitemEl.getAttribute("data-mwf-targetview");
            var targetaction = listitemEl.getAttribute("data-mwf-targetaction");
            if (targetaction) {
                console.log("ViewController.onListItemElementSelected(): will call targetaction on view controller: " + targetaction);
                // we invoke the function dynamically
                this[targetaction].call(this,itemObj);
            }
            else if (targetview) {
                console.log("ViewController.onListItemElementSelected(): will open targetview on view controller: " + targetview);
                // we pass the item as argument using the key "item"
                this.nextView(targetview, {item: itemObj});
            }
            //
            else {
                console.log("ViewController.onListItemElementSelected(): will call onListItemSelected()");
                this.onListItemSelected(itemObj, listview.id.listitemEl);
            }
        }

    }

    ViewController.prototype.onListItemSelected = function (listitem, listviewid) {
        console.info("ViewController.onListItemSelected(): " + listitem + " from " + listviewid + ". Override this function locally in order to implement desired behaviour...");
    }

    /*
     * allows subtypes to react to item selection - by default we check whether a targetview or targetaction has been specified
     * may be partially overridden for specific items and be dealt with as default by supertype call in the particular controller
     *
     * menuitem: the selected element from the menu
     * listitem: the list element for which the menu was created
     * listview: the listview
     */
    ViewController.prototype.onListItemMenuItemSelected = function (menuitem, listitem, listview) {
        console.log("ViewController.onListItemMenuItemSelected(): " + menuitem + " for " + listitem + " from " + listview);

        var targetview = menuitem.getAttribute("data-mwf-targetview");
        var targetaction = menuitem.getAttribute("data-mwf-targetaction");
        var itemid = listitem.getAttribute("data-mwf-id");
        if (itemid && (targetview || targetaction)) {
            var itemObj = this.readFromListview(listitem.getAttribute("data-mwf-id"));
            if (!itemObj) {
                console.log("ViewController.onListItemMenuItemSelected(): cannot run targetaction or targetview. Item with id does not seem to be contained in list: " + listitem.getAttribute("data-mwf-id"));
            }
            else {
                if (targetaction) {
                    console.log("ViewController.onListItemMenuItemSelected(): will call targetaction on view controller: " + targetaction);
                    // we invoke the function dynamically - TODO: need to check how this can be done more elegantly than using eval
                    var targetactionfunction = "this." + targetaction + "(itemObj)";
                    // by default, the function will be passed the item
                    eval(targetactionfunction);
                }
                else {
                    console.log("ViewController.onListItemMenuItemSelected(): will open targetview on view controller: " + targetview);
                    // we pass the item as argument using the key "item"
                    this.nextView(targetview,{item: itemObj});
                }
            }
        }
        else {
            console.warn("ViewController.onListItemMenuItemSelected(): no itemid or neither targetview nor targetaction specified for listitem. Handling selection needs to be dealt with by the given view controller implementation: " + itemid + "/" + targetview + "/" + targetaction);
        }

    }

    /*
     * allows to populate the menu element with dynamic items or to enable/disable items - we also add a callback here
     */
    ViewController.prototype.onPrepareActionmenu = function (menu, callback) {
        console.log("ViewController.onPrepareActionmenu(): " + menu);
        callback(menu);
    }

    /*
     * need to check whether this makes sense: update the actionmenuItems on updating the dom
     */
    ViewController.prototype.updateActionmenuItems = function (menu) {
        console.log("ViewController.onPrepareActionmenu(): " + menu);
        var menuitemElements = menu.getElementsByClassName("mwf-menu-item");
        this.actionmenuItems = new Object();
        for (var i = 0; i < menuitemElements.length; i++) {
            // if we have a mwfid
            var currentItem = menuitemElements[i];
            if (currentItem.hasAttribute("data-mwf-id")) {
                console.log("updateActionmenuItems(): found menuitem: " + currentItem.getAttribute("data-mwf-id"));
                this.actionmenuItems[currentItem.getAttribute("data-mwf-id")] = currentItem;
            }
            else {
                // otherwise we create an anonymous item entry using the counter
                console.log("updateActionmenuItems(): found anonymous menuitem: " + currentItem);
                this.actionmenuItems[i] = currentItem;
            }
        }
        console.log("updateActionmenuItems(): items are: " + mwfUtils.stringify(this.actionmenuItems))
    }

    // REMOVE: back action
    // TODO: why remove? This could be handled in a generic way...
    ViewController.prototype.onback = function () {
        console.log("ViewController.onback(): " + this.root.id);
        this.previousView();
    }

    ViewController.prototype.onpause = function (callback) {
        console.log("ViewController.onpause(): " + this.root.id);
        this.root.classList.remove("mwf-currentview");
        this.root.classList.add("mwf-paused");

        this.root.onclick = null;

        this.lcstatus = CONSTANTS.LIFECYCLE.PAUSED;

        if (callback) {
            callback();
        }
    };

// the four lifecycle methods which we realise by setting class attributes
    ViewController.prototype.oncreate = function (callback) {
        console.log("ViewController.oncreate(): " + this.root.id);

        console.log("ViewController.oncreate(): " + this.root);

        // reset pending event listener (there should not be any, though...)
        this.pendingEventListeners = new Array();

        // we reset all elements from the root that are marked as dynamic
        var dynelements = this.root.querySelectorAll(".mwf-dyncontent-root");
        console.log("clearing " + dynelements.length + " dynamic elements");
        for (var i = 0; i < dynelements.length; i++) {
            dynelements[i].innerHTML = "";
        }
        // we also reset all elements that are marked as dynvalue
        var dynvalelements = this.root.querySelectorAll(".mwf-dynvalue");
        console.log("clearing " + dynvalelements.length + " dynamic value elements");
        for (var i = 0; i < dynvalelements.length; i++) {
            dynvalelements[i].value = "";
        }

        // initialise generic controls if there exist any...
        prepareActionmenu.call(this);
        if (!this.listviewsPrepared) {
            prepareListviews.call(this);
        }
        prepareForms.call(this,this.root);

        // generalise back button handling
        var backbutton = this.root.querySelector(".mwf-back");
        console.log("got backbutton on " + this.root.id + ": " + backbutton);
        if (backbutton) {
            backbutton.onclick = function () {
                this.onback();
            }.bind(this);
        }

        // a generic click handler that will close any menus...
        this.root.onclick = this.hideOverlays.bind(this);

        // we will not display a view oncreate!
        // instance.root.classList.remove("mwf-idle");
        // instance.root.classList.remove("mwf-stopped");
        // instance.root.classList.remove("mwf-paused");
        // instance.root.classList.add("mwf-currentview");

        console.log("oncreate (done)");

        this.lcstatus = CONSTANTS.LIFECYCLE.CREATED;

        if (callback) {
            callback();
        }
        ;
    };

    // for the time being, we simply reset all forms
    function prepareForms(element) {
        var formEls = element.getElementsByTagName("form");
        for (var i=0;i<formEls.length;i++) {
            formEls[i].reset();
        }
    }

    ViewController.prototype.onresume = function (callback) {
        console.log("ViewController.onresume(): " + this.root.id);
        // on resume the next view will be displayed!
        this.root.classList.remove("mwf-idle");
        this.root.classList.remove("mwf-stopped");
        this.root.classList.remove("mwf-paused");
        this.root.classList.add("mwf-currentview");

        var hideOverlays = this.hideOverlays.bind(this);

        this.root.onclick = hideOverlays;
        // also add it to the body
        document.getElementsByTagName("body")[0].onclick = hideOverlays;

        // we (try to) set autofocus...
        handleAutofocus(this.root);

        this.lcstatus = CONSTANTS.LIFECYCLE.SHOWING;

        // check whether we have pending event listeners
        // TODO: here, event listeners could be checked for obsoletion...
        if (this.pendingEventListeners.length == 0) {
            console.log("ViewController.onresume(): no pending event listeners exist");
        }
        else {
            console.log("ViewController.onresume(): found pending event listeners: " + this.pendingEventListeners.length);
            // we process from beginning to end, rather than dealing the listeners array as a stack
            while (this.pendingEventListeners.length > 0) {
                var currentListener = this.pendingEventListeners[0];
                console.log("ViewController.onresume(): will run pending event listener for: " + currentListener.boundEvent.desc());
                this.pendingEventListeners.splice(0,1);
                currentListener.call();
            }
        }

        if (callback) {
            callback();
        }
    };

    ViewController.prototype.onstop = function (callback) {
        console.log("ViewController.onstop(): " + this.root.id);
        this.root.classList.remove("mwf-currentview");
        this.root.classList.add("mwf-stopped");

        this.root.onclick = null;

        // we unbind the listeners that have been registered by us
        eventhandling.removeListenersForOwner(this);

        this.lcstatus = CONSTANTS.LIFECYCLE.STOPPED;

        if (callback) {
            callback();
        }
    };

    ViewController.prototype.nextView = function (viewid, viewargs, asRootView) {
        console.log("ViewController.nextView(): " + viewid);

        // if nextView is called in rootView mode, we first clear all controllers and then call nextView...
        if (asRootView) {
            applicationState.clearControllers(function () {
                console.log("calling nextView() recursively, without rootView option");
                this.nextView(viewid, viewargs, false);
            }.bind(this));
        }
        else {
            var nextView = document.getElementById(viewid);
            if (!nextView) {
                alert("ERROR: Next view " + viewid + " could not be found!");
            } else {
                // detetermine which view controller we shall use
                var nextViewControllerClassname = nextView.getAttribute("data-mwf-viewcontroller");
                console.log("using next view controller: " + nextViewControllerClassname);

                // we create a new instance of the view controller
                var nextViewControllerFunction = require(nextViewControllerClassname);

                var nextViewController = new nextViewControllerFunction();
                console.log("created next view controller:: " + nextViewController);
                nextViewController.setViewAndArgs(nextView, viewargs);
                nextViewController.application = applicationObj;
                applicationState.pushViewController(nextViewController, asRootView);
            }
        }
    }

    ViewController.prototype.previousView = function (returnData, returnStatus) {
        console.log("previousView()");
        applicationState.popViewController(returnData, returnStatus);
    }

    ViewController.prototype.getBody = function () {
        return this.root.querySelector(".mwf-body");
    }

    /* show a dialog - the first argument may either be a string or an object */
    /* TODO: allow to pass data to which the dialog will be bound */
    ViewController.prototype.showDialog = function (dialogid, data, callback) {
        var isTemplate = false;

        console.log("showDialog(): " + dialogid + "@" + this.root.id);

        // hide any other overlay elements
        hideMenusAndDialogs.call(this);

        // now instantiate the new dialog
        // TODO: dialogs should be dealt with using the templating mechanism unless the dialog is provided as an argument
        if (typeof dialogid === 'object') {
            this.dialog = dialogid;
        }
        else {
            // either we find the dialog in the document, or the dialog is a template
            this.dialog = document.getElementById(dialogid);
            if (!this.dialog) {
                console.log("lookup dialog as template: " + dialogid);
                this.dialog = this.getTemplateInstance(dialogid);
                isTemplate = true;
            }
        }

        // check whether we have a template
        if (isTemplate) {
            this.bindDialog(dialogid, this.dialog, data);
            this.dialog = this.dialog.root;
        }

        // we reset all forms
        prepareForms.call(this,this.dialog);

        // if the dialog is a child of the view controller, move it next to it as otherwise hiding the dialog controller in the background will not work - it seems that this does not need to be undone
        if (!this.dialog.parentNode) {
            this.root.parentNode.appendChild(this.dialog);
        }
        else if (this.dialog.parentNode == this.root) {
            this.root.parentNode.appendChild(this.root.removeChild(this.dialog));
        }

        var rootelement = this.root;

        // we need to instantiate the dialog in two steps because if it is included in a view it seems to be overlayn regardless of the z-index
        this.dialog.classList.add("mwf-hidden");
        // we cancel click propagation
        this.dialog.removeEventListener("click", cancelClickPropagation);
        this.dialog.addEventListener("click", cancelClickPropagation);

        var dia = this.dialog;
        setTimeout(function () {
            dia.classList.add("mwf-shown");
            dia.classList.remove("mwf-hidden");
            rootelement.classList.add("mwf-dialog-shown");
            handleAutofocus(dia);

            // check whether the dialog uses a view controller or not
            var dialogCtrl = applicationState.getEmbeddedController(dialogid);
            if (dialogCtrl) {
                this.handleDialogWithController(dialogCtrl,callback,data);
            }
            else if (callback) {
                callback();
            }
        }.bind(this), 100);
    }

    ViewController.prototype.handleDialogWithController = function(dialogCtrl,callback,data) {
        console.log("showDialog(): dialog uses view controller. Pass arguments and call onresume.");
        dialogCtrl.setViewAndArgs(this.dialog,data ? data : {});

        // if we have an dialog controller, the hideDialog() and showDialog() functions need to be bound to the currently active view controller, rather than
        // to the embedded controller. Try it...
        dialogCtrl.showDialog = this.showDialog.bind(this);
        dialogCtrl.hideDialog = this.hideDialog.bind(this);

        console.log("lcstatus of dialog controller: " + dialogCtrl.lcstatus);

        // check whether the dialog has already been created or if it is only in constructed mode
        if (dialogCtrl.lcstatus == CONSTANTS.LIFECYCLE.CONSTRUCTED) {
            console.log("showDialog(): dialog view controller needs to be initialised. Will call oncreate()...");
            dialogCtrl.oncreate(function(){
                dialogCtrl.onresume(function () {
                    console.log("will cancel click on dialog controller...");
                    dialogCtrl.root.onclick = cancelClickPropagation;
                    if (callback) {
                        callback();
                    }
                });
            });
        }
        else {
            dialogCtrl.onresume(function () {
                console.log("will cancel click on dialog controller...");
                dialogCtrl.root.onclick = cancelClickPropagation;
                if (callback) {
                    callback();
                }
            });
        }
    }

    /* hide a dialog */
    ViewController.prototype.hideDialog = function (callback) {
        console.log("hideDialog(): " + this.dialog + "@" + this.root.id);
        if (!this.dialog) {
            console.log("hideDialog(): There is no active dialog! Ignore...");
            if (callback) {
                callback();
            }
        } else {
            this.dialog.onclick = null;
            this.root.classList.remove("mwf-dialog-shown");
            this.dialog.classList.remove("mwf-shown");
            console.log("hideDialog(): removal done... now callback: " + callback);

            // check whether the dialog uses a view controller or not
            var dialogCtrl = applicationState.getEmbeddedController(this.dialog.id);
            if (dialogCtrl) {
                console.log("hideDialog(): call onpause on dialog controller");
                // we call on pause
                this.dialog = null;
                dialogCtrl.onpause(function(){
                    if (callback) {
                        callback();
                    }
                });
            }
            else {
                this.dialog = null;
                if (callback) {
                    callback();
                }
            }
        }
    }

    ViewController.prototype.getTemplateInstance = function (templatename) {
        console.log("getTemplateInstance(): " + templatename);
        var templateInstance = applicationResources.getTemplateInstance(templatename);

        return templateInstance;
    }

    /*
     * bind a view element to some data - elementid might either be an element or a template - this function will be used by subclasses, e.g. for instantiating forms
     */
    ViewController.prototype.bindElement = function (elementid, data, attachToRoot) {
        console.log("bindElement(): " + elementid);

        var boundElement = null;

        function isTemplateWrapper(element) {
            // either no classes (mere div wrapper), or mwf-template and at most mwf-databind
            if (element.classList.length == 0 || (element.classList.contains("mwf-template") && (element.classList.length == 2 ? element.classList.contains("mwf-databind") : element.classList.length == 1))) {
                console.log("bindElement(): element is a mere wrapper. Will attach it to root elemenent if provided: " + attachToRoot);
                return true;
            }
            else {
                return false;
            }
        }

        if (typeof elementid === 'string') {
            var element = this.root.querySelector("#" + elementid);
            if (!element) {
                console.log("bindElement(): binding to a template");
                element = this.getTemplateInstance(elementid);
                console.log("bindElement(): found template: " + element);

                // check whether we have a mere template, whose content needs to be unwrapped
                applyDatabinding(attachToRoot && isTemplateWrapper(element.root) ? attachToRoot : element.root, element.body, data);

                boundElement = element.root;
            }
            else {
                console.log("bindElement(): binding to a non-template element");
                applyDatabinding(attachToRoot && isTemplateWrapper(element) ? attachToRoot : element, element.innerHTML, data);

                boundElement = element;
            }
        }
        else {
            // otherwise we have a element that may be treated itself as a template root
            console.log("bindElement(): binding a dom element");
            applyDatabinding(attachToRoot && isTemplateWrapper(elementid) ? attachToRoot : elementid, elementid.innerHTML, data);

            boundElement = elementid;
        }

        if (boundElement) {
            if (attachToRoot) {
                attachToRoot.appendChild(boundElement);
                return attachToRoot;
            }
            else {
                return boundElement;
            }
        }

        console.log("bindElement(): failed for: " + elementid);
        return null;
    }

    /*
     * this is for listview handling - note that the last parameter is always the optional parameter that identifies the listview
     */
    ViewController.prototype.initialiseListview = function (items, listviewid) {
        if (!this.listviewsPrepared) {
            console.log("initialiseListview(): listviews have not yet been prepared for " + this.root.id + ". Prepare them...");
            prepareListviews.call(this);
        }

        var listview = getListviewAdapter.call(this, listviewid);
        listview.clear();
        listview.addAll(items);
    }

    ViewController.prototype.addToListview = function (item, listviewid) {
        var listview = getListviewAdapter.call(this, listviewid);

        console.log("addToListview(): " + listview + "/" + item);
        listview.add(item);
    }

    ViewController.prototype.updateInListview = function (itemid, item, listviewid) {
        var listview = getListviewAdapter.call(this, listviewid);

        console.log("updateInListview(): " + listview + "/" + item);

        listview.update(itemid, item);
    }

    ViewController.prototype.removeFromListview = function (itemid, listviewid) {
        var listview = getListviewAdapter.call(this, listviewid);

        console.log("removeFromListview(): " + listview + "/" + itemid);
        listview.remove(itemid);
    }

    ViewController.prototype.readFromListview = function (itemid, listviewid) {
        var listview = getListviewAdapter.call(this, listviewid);

        console.log("readFromListview(): " + listview + "/" + itemid);
        return listview.read(itemid);
    }

    ViewController.prototype.readAllFromListview = function (itemid, listviewid) {
        var listview = getListviewAdapter.call(this, listviewid);

        console.log("readAllFromListview(): " + listview);
        return listview.elements;
    }

    /*
     * this is the default binding that uses templating with Ractive
     */
    ViewController.prototype.bindListItemView = function (viewid, itemview, item, replacement) {
        console.log("bindListItemView(): " + viewid);
        applyDatabinding(replacement ? replacement.root : itemview.root, replacement ? replacement.body : itemview.body, item);

        // we replace the innerhtml content
        if (replacement) {
            itemview.innerHTML = replacement.root.innerHTML;
        }

        // we need to set the touchlisteners here, as content of itemview will have been created new
        touchEnableOffspring(replacement ? itemview : itemview.root);

        // for subtypes, we return the viewProxy
        return (replacement ? replacement.root.viewProxy : itemview.root.viewProxy);
    }

    /*
     * bind a dialog to data - by default, this will assume that we will be passed the dialog as a template segmented in root and body
     */
    ViewController.prototype.bindDialog = function (dialogid, dialog, data) {
        console.log("bindDialog(): " + dialogid);
        applyDatabinding(dialog.root, dialog.body, data);
    }

    /*
     * we always pass ourselves as the owner
     */
    ViewController.prototype.addListener = function(event,listener,runOnPaused) {
        eventhandling.addListener(event,listener,this,{runOnPaused: runOnPaused});
    }

    ViewController.prototype.notifyListeners = function(event) {
        eventhandling.notifyListeners(event);
    }

    /* we do not want to expose status directly to the subtypes */
    ViewController.prototype.markAsObsolete = function() {
        console.log("marking controller as obsolete: " + this.root.id);
        this.lcstatus = CONSTANTS.LIFECYCLE.OBSOLETE;
    }

    /*
     * this handles event listener callbacks
     */
    ViewController.prototype.runEventListener = function(listener) {
        console.log("runEventListener(): for event: " + listener.boundEvent.desc());
        console.log("runEventListener(): lifecycle status is: " + this.lcstatus);

        switch (this.lcstatus) {
            case CONSTANTS.LIFECYCLE.SHOWING:
                console.log("runEventListener(): controller is running in the foreground. Execute listener...");
                listener.call();
                break;
            case CONSTANTS.LIFECYCLE.PAUSED:
                // check whether the listener has parameters set (which may cause immediate execution)
                if (listener.eventHandlerParams && listener.eventHandlerParams.runOnPaused) {
                    console.log("runEventListener(): controller is paused, but listener says runOnPaused. Run it...");
                    listener.call();
                }
                else {
                    console.log("runEventListener(): controller is paused. Will add listener to pending listeners...");
                    this.pendingEventListeners.push(listener);
                }
                break;
            case CONSTANTS.LIFECYCLE.CREATED:
                console.log("runEventListener(): controller has not been shown so far. There might be something wrong, but we will add listener to pending listeners...");
                break;
            default:
                console.log("runEventListener(): listener will not be handled at the current lifecycle phase: " + this.lcstatus);
        }

    }

    // global accessors

    ViewController.prototype.setGlobal = function(key,value) {
        GLOBAL[key] = value;
    }

    ViewController.prototype.hasGlobal = function(key) {
        return (GLOBAL[key] ? true : false);
    }

    ViewController.prototype.getGlobal = function(key) {
        return GLOBAL[key];
    }

    ViewController.prototype.removeGlobal =function(key) {
        delete GLOBAL[key];
    }


    /*
     * encapsulare the template engine underneath of these function - this is executed synchronically
     */
    function TemplateProxy(ractive) {

        this.update = function(update) {
            ractive.set(update);
        }

        this.bindAction = function(actionname,actiondef) {
            ractive.on(actionname,actiondef);
        }

    }

    function applyDatabinding(root, body, data) {
        var ractive = new Ractive({
            el: root,
            template: body,
            data: data
        });
        // we add the ractive object as a handle to the root in order to do updates
        root.viewProxy = new TemplateProxy(ractive);
        touchEnableOffspring(root);
    }

    /*
     * utility function used for all listview methods
     */
    function getListviewAdapter(listviewid) {

        console.log("getListviewAdapter(): " + listviewid);

        if (arguments.length == 0 || !listviewid) {
            if (Object.keys(this.listviewAdapters).length == 1) {
                return this.listviewAdapters[Object.keys(this.listviewAdapters)[0]];
            }
            else {
                console.error("getListview(): cannot use default for listview. Either no or multiple listviews exist in view " + this.root.id);
            }
        }
        else {
            var listview = this.listviewAdapters[listviewid];
            if (listview) {
                return listview;
            }
            else {
                console.error("getListview(): listview wih id " + listviewid + " does not seem to exist in view " + this.root.id);
            }
        }
    }

    /*
     * extension for embedded view controllers that require additional functions
     */
    function EmbeddedViewController() {

        var proto = EmbeddedViewController.prototype;

        this.parent = null;

        this.oncreate = function (callback) {
            proto.oncreate.call(this, function () {
                callback();
            }.bind(this));
        }

        this.attachToView = function (view) {
            console.log("attaching component " + this.root.id + " to view: " + view.id);
            this.parent = view;
        }

        this.detachFromView = function () {
            if (parent) {
                console.log("detaching component " + this.root.id + " from current view");
            }
            else {
                console.log("component " + this.root.id + " is currently not attached.");
            }
        }

    }

    // extend the base ViewController type
    mwfUtils.xtends(EmbeddedViewController, ViewController);

    /*
     * generic implementation of a view controller that controls the usage of the side menu - subtypes only need to override the onMenuItemSelected() function
     */
    function SidemenuViewController() {

        // this is for convenience: we use the proto variable for having a shortcut to supertype members
        var proto = SidemenuViewController.prototype;

        // the action to open the menu
        var mainmenuAction;

        // the event listeners that will result in showing and hiding the menu
        var showMenu;
        var hideMenu;

        this.oncreate = function (callback) {
            proto.oncreate.call(this, function () {

                showMenu = function (event) {
                    console.log("showMenu()");
                    hideMenusAndDialogs.call(this);
                    this.root.classList.add("mwf-expanded");
                    this.root.onclick = cancelClickPropagation;
                    // we must not propagate, otherwise this triggers the hideMenu listener...
                    event.stopPropagation();
                }.bind(this);

                hideMenu = function () {
                    console.log("hideMenu()");
                    this.root.classList.remove("mwf-expanded");
                }.bind(this);

                // from the root we try to read out the menu items... something gets wrong here...
                var menuItems = this.root.getElementsByClassName("mwf-menu-item");
                console.log("found " + menuItems.length + " menu items");
                for (var i = 0; i < menuItems.length; i++) {
                    console.log("setting listener on: " + menuItems[i].getAttribute("data-mwf-id"));
                    menuItems[i].onclick = function (event) {
                        if (event.currentTarget.classList.contains("mwf-menu-item")) {
                            this.onMenuItemSelected(event.currentTarget);
                        }
                    }.bind(this);
                }

                callback();
            }.bind(this));

        }

        this.onMenuItemSelected = function (item) {
            console.log("onMenuItemSelected(): " + item);
            console.log("onMenuItemSelected(): id " + item.id + "/ mwf-id " + item.getAttribute("data-mwf-id"));
            var currentSelected = document.getElementsByClassName("mwf-selected");
            for (var i = 0; i < currentSelected.length; i++) {
                currentSelected[i].classList.remove("mwf-selected");
            }
            item.classList.add("mwf-selected");

            // check whether the item has a target specified - otherwise the item needs to be treated locally
            var targetVC = item.getAttribute("data-mwf-targetview");
            if (targetVC) {
                // the nextView will be started as a root view, i.e. all existing views will be removed
                this.nextView(targetVC, null, true);
            }
            else {
                mwfUtils.showToast("option " + item.getAttribute("data-mwf-id") + " is not supported yet!");
            }

        }

        // handle attachment
        this.attachToView = function (view) {
            console.log("attachToView: " + view);
            proto.attachToView.call(this, view);

            // we lookup the mainmenu action from the view and attach to it
            var mainmenuActionElements = view.getElementsByClassName("mwf-img-sandwich-action");
            console.log("found mainmenu elements: " + mainmenuActionElements.length);
            if (mainmenuActionElements.length == 0) {
                console.log("view " + view.id + " does not seem to use a mainmenu action");
            }
            else {
                // add the handler to open the menu
                mainmenuAction = mainmenuActionElements[0];
                mainmenuAction.addEventListener("click", showMenu);
                // add a handler to close the menu on the whole parent element (which will be partially hidden by ourselves)
                this.parent.addEventListener("click", hideMenu);
            }
        }

        // handle detachment, in this case, we set the mainmenuAction to null
        this.detachFromView = function () {
            proto.detachFromView.call(this);

            // if on detaching, the menu is shown, we need to hide it
            if (this.root.classList.contains("mwf-expanded")) {
                hideMenu();
            }

            if (mainmenuAction) {
                mainmenuAction.removeEventListener("click", showMenu);
                this.parent.removeEventListener("click", hideMenu);
                mainmenuAction = null;
            }

        }

    }

    mwfUtils.xtends(SidemenuViewController, EmbeddedViewController);

    /* this is for hiding all menus and dialogs before popping new ones */
    function hideMenusAndDialogs() {
        console.log("hideMenusAndDialogs(): " + this.parent);

        // check whether the parent has an actionmenu and close it - this only applies to an EmbeddedViewController
        if (this.parent && this.parent.getElementsByClassName) {
            var actionmenu = this.parent.getElementsByClassName("mwf-actionmenu");
            if (actionmenu.length > 0) {
                actionmenu[0].classList.remove("mwf-expanded");
            }
        }

        // hide a local actionmenu
        var actionmenu = this.root.getElementsByClassName("mwf-actionmenu");
        if (actionmenu.length > 0) {
            actionmenu[0].classList.remove("mwf-expanded");
        }

        var dialog = document.querySelector(".mwf-dialog.mwf-shown");
        if (dialog) {
            var dialogid = getDialogId(dialog);
            // check whether the dialog has an embedded controller
            var dialogCtrl = applicationState.getEmbeddedController(dialogid);
            if (dialogCtrl) {
                console.log("hideMenusAndDialogs(): open dialog " + dialogid + " uses an own controller. Invoke hideDialog() on the controller...");
                dialogCtrl.hideDialog();
            }
            else {
                console.log("hideMenusAndDialogs(): open dialog " + dialogid + " does not use a controller. Just change styling...");
                dialog.classList.remove("mwf-shown");
                dialog.onclick = null;
            }
        }

        console.log("hideMenusAndDialogs(): root is: " + this.root.id);
        this.root.classList.remove("mwf-dialog-shown");

        // hide sidemenu - note that the sidemenu is looked up at document level
        var sidemenu = document.getElementsByClassName("mwf-sidemenu");
        if (sidemenu.length > 0) {
            sidemenu[0].classList.remove("mwf-expanded");
        }
    }

    function getDialogId(dialog) {
        // the dialogId is either the id or the data-mwf-templatename
        return dialog.id ? dialog.id : dialog.getAttribute("data-mwf-templatename");
    }

    // this is used for touch-enabling elements. Note that event listeners are not copied when templates are cloned!
    function touchEnableOffspring(node) {
        console.log("touch-enabled offspring of: " + node);
        // we touch-enable elements by default or on demand
        var touchEnabled = node.querySelectorAll("input[type=submit], button, .mwf-imgbutton, .mwf-touchfeedback, .mwf-menu-item");
        console.log("found " + touchEnabled.length + " touch-enabled elements");
        for (var i = 0; i < touchEnabled.length; i++) {
            console.log("touch-enable element: " + touchEnabled[i] + ", with classes: " + touchEnabled[i].getAttribute("class"));
            mwfUtils.feedbackTouchOnElement(touchEnabled[i]);
        }
    }

    // this is the initial method that will be called when the document and all scripts have been loaded
    function onloadApplication() {
        console.log("onload()");

        // check whether we have any element marked as mwf-styling, in which case we just cut all elements and add the one to be styled, marking mwf-shown
        // the array returned by querySelectorAll will keep the elements regardless of whether they are removed from the body or not
        var stylingElements = document.querySelectorAll(".mwf-styling");
        if (stylingElements.length > 0) {
            console.info("application is running in styling mode. Remove all elements from body apart from the ones marked as mwf-styling");
            var body = document.getElementsByTagName("body")[0];
            while (body.firstChild) {
                body.removeChild(body.firstChild);
            }
            body.classList.remove("mwf-loading-app");
            console.log("adding " + stylingElements.length + " styling elements to body");
            for (var i=0;i<stylingElements.length;i++) {
                var stylingEl = stylingElements[i];
                // append the first element out of the list
                if (stylingEl.classList.contains("mwf-view")) {
                    stylingEl.classList.add("mwf-currentview");
                }
                body.appendChild(stylingEl);
            }
        }
        else {
            console.log("application is running in runtime mode");

            // check whether the application contains embedded templates and output an error
            var embeddedTemplates = document.querySelectorAll(".mwf-template .mwf-template");
            if (embeddedTemplates.length == 0) {
                console.log("embedded templates check sucessful. None was found.");
            }
            else {
                var templatesmsg = "";
                for (var i = 0; i < embeddedTemplates.length; i++) {
                    templatesmsg += embeddedTemplates[i].tagName + "[" + embeddedTemplates[i].getAttribute("data-mwf-templatename") + "]: " + embeddedTemplates[i].getAttribute("class");
                    +"\n";
                }
                alert("ERROR: application contains embedded templates! This will cause trouble!:\n\n " + templatesmsg);
            }

            // first of all, we mark the body as loading - this would allow showing, e.g., some splash screen
            document.querySelector("body").classList.add("mwf-loading-app");

            // we first of all set all views to idle
            var views = document.getElementsByClassName("mwf-view");
            for (var i = 0; i < views.length; i++) {
                views[i].classList.add("mwf-idle");
            }

            touchEnableOffspring(document);

            // then we initialise the application state
            applicationState = new ApplicationState();
            applicationResources = new ApplicationResources();


            // instantiate the top level view controllers (which are children of the root element)
            var embeddedComponents = document.querySelectorAll("body > .mwf-view-component");

            console.log("found " + embeddedComponents.length + " top level components!");
            for (var i = 0; i < embeddedComponents.length; i++) {
                var currentComponentViewControllerClassname = embeddedComponents[i].getAttribute("data-mwf-viewcontroller");
                console.log("loading top level embedded view controller: " + currentComponentViewControllerClassname);
                // check whether the controller is attaching or not

                // load and instantiate the controller
                var currentComponentViewControllerFunction = require(currentComponentViewControllerClassname);
                //console.log("currentComponent function: " + currentComponentViewControllerFunction);

                var currentComponentViewController = new currentComponentViewControllerFunction();

                if (embeddedComponents[i].classList.contains("mwf-attaching")) {
                    currentComponentViewController.mwfAttaching = true;
                }

                // set view
                currentComponentViewController.setViewAndArgs(embeddedComponents[i]);

                // call oncreate if it specifies mwf-initialise-onload
                // attach to the initialView will be done inside of the pushViewController function
                if (embeddedComponents[i].classList.contains("mwf-initialise-onload")) {
                    currentComponentViewController.oncreate(function () {
                        applicationState.addEmbeddedController(currentComponentViewController);
                    });
                }
                else {
                    applicationState.addEmbeddedController(currentComponentViewController);
                }
            }

            // we extract the templates here in order not to get in conflict with the embedded view controllers
            applicationResources.extractTemplates();

            // TODO: we might add more of the above processing into the application?

            // now instantiate the application
            var bodyEl = document.getElementsByTagName("body")[0];
            var applicationClassname = bodyEl.getAttribute("data-mwf-application");
            if (applicationClassname) {
                console.info("onLoadApplication(): using custom application: " + applicationClassname);
                // the application will be realised as a singleton!
                applicationObj = require(applicationClassname);
            }
            else {
                console.warn("onLoadApplication(): no custom application is specified. Use default implementation.")
                applicationObj = new Application();
            }

            // set the body element on the application
            applicationObj.bodyElement = bodyEl;

            // we run oncreate on the application
            applicationObj.oncreate(function () {

                var initialView = applicationObj.initialView;

                // detetermine which view controller we shall use initially
                var initialViewControllerClassname = initialView.getAttribute("data-mwf-viewcontroller");
                console.log("using initial view controller: " + initialViewControllerClassname);

                var initialViewControllerFunction = require(initialViewControllerClassname);
                var initialViewController = new initialViewControllerFunction();

                initialViewController.application = applicationObj;
                initialViewController.setViewAndArgs(initialView);
                console.log("after setting view and args, root is: " + initialViewController.root);

                // here, loading is finished
                document.querySelector("body").classList.remove("mwf-loading-app");

                // we set a listener that reacts to changes of the window location
                window.onbeforeunload = function () {
                    confirm("Do you really want to leave this app?")
                };

                // push the initial view controller to the application state
                applicationState.pushViewController(initialViewController);
            })

        }

    }

    /*
     * application superclass, holds shared resources, and subclasses may implement shared logics
     */
    function Application() {

        this.CRUDOPS = new Object();
        this.CRUDOPS.LOCAL = "local";
        this.CRUDOPS.REMOTE = "remote";
        this.CRUDOPS.SYNCED = "synced";

        this.bodyElement;

        this.initialView;

        this.currentCRUDScope;

        var crudops = new Object;

        this.oncreate = function(callback) {
            console.log("oncreate()");

            var initialViews = this.bodyElement.getElementsByClassName("mwf-view-initial");
            if (initialViews.length == 0) {
                showToast("No initial view could be found!");
            } else {
                this.initialView = initialViews[0];
                console.log("Application.oncreate(): determined initialView: " + this.initialView.id);
            }

            callback();
        }

        this.registerEntity = function(entitytype,entitytypedef,notify) {
            console.log("registerEntity(): " + entitytype);

            var typecrudops = crudops[entitytype];
            if (!typecrudops) {
                typecrudops = new Object();
                crudops[entitytype] = typecrudops;
            }
            typecrudops.typedef = entitytypedef;
            typecrudops.notify = notify;
        }

        this.registerCRUD = function(entitytype,scope,impl) {
            console.log("registerCRUD(): crudops declaration for " + entitytype + " in scope " + scope);

            var typecrudops = crudops[entitytype];
            if (!typecrudops) {
                typecrudops = new Object();
                crudops[entitytype] = typecrudops;
            }
            typecrudops[scope] = impl;
        }

        this.initialiseCRUD = function(scope,em) {
            if (!em) {
                em = EntityManager;
            }

            console.log("initialiseCRUD(): crudops declaration is: " + mwfUtils.stringify(crudops));

            for (var entitytype in crudops) {
                var crudopsdecl = crudops[entitytype];
                var impl = crudopsdecl[scope];
                if (!impl) {
                    console.error("initialiseCRUD(): could not find impl for entitytype " + entitytype + " in scope " + scope + ".This will not work!");
                }
                else {
                    console.log("initialiseCRUD(): initialising impl for entitytype " + entitytype + " in scope: " + scope);
                    em.addCRUD(entitytype,impl,crudopsdecl.typedef,crudopsdecl.notify);
                }
            }
            this.currentCRUDScope = scope;
        }

        this.switchCRUD = function(scope,em) {

            if (!em) {
                em = EntityManager;
            }

            for (var entitytype in crudops) {
                this.switchCRUDForType(entitytype,scope,em);
            }
            this.currentCRUDScope = scope;
        }

        this.switchCRUDForType = function(entitytype,scope,em) {
            if (!em) {
                em = EntityManager;
            }

            var impl = crudops[entitytype][scope];
            if (!impl) {
                console.warn("switchCRUDForType(): could not find impl for entitytype " + entitytype + " in scope " + scope + ". Will not change existing impl");
            }
            else {
                console.log("switchCRUDForType(): switching impl for entitytype " + entitytype + " to scope: " + scope);
                em.resetCRUD(entitytype,impl);
            }
        }


    }

    // allow to broadcast events from the application
    Application.prototype.notifyListeners = function(event) {
        eventhandling.notifyListeners(event);
    }

    /*
     *  a class that allows to represent reusable resources used by the application - for the time being we use this for markup templates
     */
    function ApplicationResources() {

        /* the templates */
        var templates = {};

        /* on initialising, we read out all templates from the document, remove them from their location in the dom and store them in the templates variable */

        /* note that reading out the template elements and removing them needs to be done in two steps */
        this.extractTemplates = function() {
            var templateels = document.getElementsByClassName("mwf-template");
            console.log("found " + templateels.length + " templates");
            for (var i = 0; i < templateels.length; i++) {
                var currentTemplate = templateels[i];
                var templatename = currentTemplate.getAttribute("data-mwf-templatename");
                console.log("found template " + templatename + ": " + currentTemplate);
                templates[templatename] = currentTemplate;
            }

            for (var templatename in templates) {
                var currentTemplate = templates[templatename];
                currentTemplate.parentNode.removeChild(currentTemplate);
            }
        }

        /* get a template */
        this.getTemplateInstance = function (templatename) {
            var template = templates[templatename];
            if (!template) {
                console.error("the template " + templatename + " does not exist!");
            }
            else {
                // we will always return a segmented object which has at least root set!!!
                var instance = null;
                if (template.classList.contains("mwf-databind")) {
                    console.log("template " + templatename + " uses databinding. Return as root+body segmented object...");
                    instance = {
                        root: template.cloneNode(false),
                        body: template.innerHTML
                    };
                }
                else {
                    var instance = template.cloneNode(true);
                    touchEnableOffspring(instance);
                    instance = {root: instance};
                }

                return instance;
            }
        }

        /* get a template */
        this.hasTemplate = function (templatename) {
            var template = templates[templatename];
            return template != null && template != undefined;
        }
    }

    /*
     * a listview adapter that binds a list of objects to a view - we pass the controller, which will be called back for determining the view of a single element
     */
    function ListviewAdapter(_listview, _controller, _resources) {

        this.listviewId;
        this.elements = new Array();

        var listview;
        var listitemTemplateId;
        var controller;
        var resources;

        console.log("ListviewAdapter: initialising for listview " + listview);

        listview = _listview;
        // here we use the conventional id, rather than the mwf-id
        this.listviewId = listview.id;
        listitemTemplateId = listview.getAttribute("data-mwf-listitem-view");
        controller = _controller;
        resources = _resources;

        this.clear = function () {
            this.elements = new Array();
            mwfUtils.clearNode(listview);
        }

        // on initialising, we add a new listitem view for each element of the list
        this.addAll = function (elements) {
            for (var i = 0; i < elements.length; i++) {
                var currentItem = elements[i];
                this.elements.push(currentItem);
                addItemView(currentItem);
            }
        }

        function addItemView(item) {
            var itemview = resources.getTemplateInstance(listitemTemplateId);
            mwfUtils.feedbackTouchOnElement(itemview.root);
            // by default, we set the itemid on the itemview
            itemview.root.setAttribute("data-mwf-id", item._id);
            // this is a sync call, i.e. we do not assume for any model operations to take place there... controller needs to do binding as side-effect on the itemview object
            controller.bindListItemView(this.listviewId, itemview, item);
            listview.appendChild(itemview.root);
            // scroll to the new item
            itemview.root.scrollIntoView();
        }

        // these are the functions that allow to manipulate list+view
        this.remove = function (itemId) {
            console.log("remove(): " + itemId);
            var selector = ".mwf-listitem[data-mwf-id=\'" + itemId + "\']";
            var itemview = listview.querySelector(selector);
            if (itemview) {
                itemview.parentNode.removeChild(itemview);
                for (var i = 0; i < this.elements.length; i++) {
                    if (this.elements[i]._id == itemId) {
                        this.elements.splice(i, 1);
                        break;
                    }
                }
            }
            else {
                console.warn("remove(): failed. cannot find itemview for id: " + itemId);
            }
        }

        this.add = function (item) {
            console.log("add(): " + item);
            addItemView(item);
            this.elements.push(item);
        }

        this.update = function (itemId, update) {
            console.log("update(): " + itemId + ", using update: " + mwfUtils.stringify(update));
            // lookup the itemview
            var selector = ".mwf-listitem[data-mwf-id=\'" + itemId + "\']";
            var itemview = listview.querySelector(selector);
            if (itemview) {
                var item;
                // we first lookup the existing item and update it
                for (var i = 0; i < this.elements.length; i++) {
                    if (this.elements[i]._id == itemId) {
                        item = this.elements[i];
                        for (var key in update) {
                            item[key] = update[key];
                        }
                        break;
                    }
                }
                if (item) {
                    // we can let the controller bind the item without creating a new view - if we use databinding the item will be replaced, though...
                    console.log("updating item in listview: " + item);
                    // using templating, we need to replace the existing element with a new one (replacement will be passed as optional 4th argument
                    controller.bindListItemView(this.listviewId, itemview, item, resources.getTemplateInstance(listitemTemplateId));
                }
            }
            else {
                console.warn("update(): failed. cannot find itemview for id: " + itemId);
            }
        }

        this.read = function (itemId) {
            console.log("ListviewAdapter.read(): " + itemId + ", num of elements are: " + this.elements.length);
            for (var i = 0; i < this.elements.length; i++) {
                console.log("checking element: " + mwfUtils.stringify(this.elements[i]));
                if (this.elements[i]._id == itemId) {
                    return this.elements[i];
                }
            }
            return null;
        }

        this.length = function() {
            return this.elements.length;
        }

    }

    function cancelClickPropagation(e) {
        if (e.eventPhase != Event.CAPTURING_PHASE) {
            e.stopPropagation();
        }
    }

    function handleAutofocus(element) {
        var autofocus = element.querySelector(".mwf-autofocus");
        if (autofocus) {
            console.log("focus on: " + autofocus);
            autofocus.focus();
        }
    }

    // for conceptual/terminological clarity, we introduce a second constructor for event: EventMatcher, which will not accept a data object
    function EventMatcher(_group, _type, _target) {
        if (arguments.length == 4) {
            alert("ERROR: EventMatcher does not accept 4 arguments. Do you intend to use Event?");
        }
        // call the supertype constructor
        eventhandling.Event.call(this,_group,_type,_target);
    }


    mwfUtils.xtends(EventMatcher,eventhandling.Event);

    return {
        Application: Application,
        ApplicationState: ApplicationState,
        ViewController: ViewController,
        EmbeddedViewController: EmbeddedViewController,
        SidemenuViewController: SidemenuViewController,
        ApplicationResources: ApplicationResources,
        onloadApplication: onloadApplication,
        applyDatabinding: applyDatabinding,
        stringify: mwfUtils.stringify,
        // also pass the event constructor
        Event: eventhandling.Event,
        EventMatcher: EventMatcher,
        segmentTypedId: EntityManager.segmentId,
        xtends: mwfUtils.xtends
    }

});

