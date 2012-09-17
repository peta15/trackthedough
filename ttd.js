// note jquery template can be compiled if reused a lot with $.template()
// .page() will apply jquery mobile formatting to the dynamically created content

/***********************************************************************************
 * INITIALIZATION AND GLOBALS
 ***********************************************************************************/

//our namespace
var TTD = {

	eventTypeEnum: {
		GROUP: 'groupExpense',
		PERSONAL: 'personalExpense',
		TRANSFER: 'transfer',
		BUSINESS: 'business',
		SETTLE: 'settle'
	},
	
	// used for tax, tip
	amountTypeEnum: {
		PERCENT: 'percent',
		VALUE: 'value'
	},
	
	currentEvent: {
		eventType: '', //eventTypeEnum
		eventData: {},
		date: '',
		eventId: 0,
		notes: '',
		location: 'New York, NY',
		isHistorical: false
	},
	
	eventHistory: [],
	
	// current state
	settings: {
		taxRate: .08,
		taxLoc: 'new york, ny'
	},
	
	eventData: {},
	
	// balance: + the net amount they owe you / - the net amount you owe them
	users: {},
	user: function user(name) {
		this.balance = 0;
	},

    filter: '' // filter events history page when clicking on userhistory page user
};

// TODO maybe make this a closure if we have associated functionality per event type
// default values
TTD.eventData[TTD.eventTypeEnum.GROUP] = {
	subtotal: 0,
	tax: 0,
	tip: 0, // if tip is 0 then we don't include it
	// assume tip and tax are fractions of subtotal and together sum to total
	users: [], //user object
	user: function user(name) {
		this.name = name;
		this.owes = 0;
		this.manualOwes = false; // tracks whether manually set so we know not to override automatically
		this.paying = 0;
		this.manualPaying = false;
		this.balance = 0; // balance effect for this event per user: + the net amount they owe you / - the net amount you owe them
	}
};

TTD.eventData[TTD.eventTypeEnum.PERSONAL] = {
	subtotal: 0,
	tax: 0,
	tip: 0 // if tip is 0 then we don't include it
	// assume tip and tax are fractions of subtotal and together sum to total
};

TTD.eventData[TTD.eventTypeEnum.TRANSFER] = {
	users: [], //user object // users you are transferring with
	user: function user(name) {
		this.name = name;
		this.amount = 0; // + they are transferring you money/credit, - you are transferring them money/credit
		this.balance = 0; // balance effect for this event per user: + the net amount they owe you / - the net amount you owe them
	}
};

//config settings are environment dependent (ie dev or prod)
if(window.location.hostname == "www.trackthedough.com") {
	TTD.config = {
		debug: false
	};
} else {
	//localhost
	TTD.config = {
		debug: true
	};
}

$(document).bind("mobileinit", function(){
	// page overrides
	// $.mobile.defaultTransition = 'none'; // set this if page transitions are jerky on non iphones
});

//apply format now to 2 decimal places
$( function() {
 $('.currency').currencyFormat();
});

//apply format now to 0 decimal places
$( function() {
 $('.currency0').currencyFormat(0);
});

restoreEventHistory();

/***********************************************************************************
 * PHONEGAP
 ***********************************************************************************/

function onBodyLoad()
{
	document.addEventListener("deviceready",onDeviceReady,false);
}

/* When this function is called, PhoneGap has been initialized and is ready to roll */
function onDeviceReady()
{
	TTD.debug("======> TTD phonegap device is ready");
	try {
		var options = new ContactFindOptions();
		//options.filter="Bob";
		var fields = ["displayName", "id"];
		navigator.service.contacts.find(fields, onSuccessContacts, onErrorContacts, options);
	} catch(e) {
		TTD.error("failed to retrieve contact list: " + e.message);
	}
}

// onSuccess: Get a snapshot of the current contacts
//
function onSuccessContacts(contacts) {
	TTD.debug('returning contact names');
    for (var i=0; i<contacts.length; i++) {
        TTD.debug("Display Name = " + contacts[i].displayName + ", id: " + contacts[i].id);
        // TODO ensure no user called me and identify users by id rather than name
        TTD.users[contacts[i].displayName] = new TTD.user(contacts[i].displayName);
    }
    TTD.users = sortObj(TTD.users); //sort users into alphabetical order
}

// onError: Failed to get the contacts
//
function onErrorContacts() {
    TTD.error('error retrieving contact list from phone');
}

/***********************************************************************************
 * PAGE LOGIC
 ***********************************************************************************/
$(function(){
	try {

		if(!isPhonegap()){
			TTD.debug('not running phoneGap: using test input data');
			TTD.users = {
			     'Aaron': {balance: 0},
			     'Aatish': {balance: 0},
			     'Jesse': {balance: 0},
			     'Marc': {balance: 0},
			     'Mary': {balance: 0},
			     'Mike': {balance: 0},
			     'Orion': {balance: 0},
			     'Willa': {balance: 0},
			     'Zachary': {balance: 0}
		    };
		} else {
			TTD.debug('running phoneGap!');
		}
		
	} catch(e) {
		TTD.error("JS UNCAUGHT ERROR: " + e.message);
	}
});

$("#eventTypePage ul:jqmData(role='listview') li").live('click', function() {
	try {
		//save event type chosen and setup event
		var eventType = $(this).attr('id').split('-')[1];
		TTD.currentEvent.eventType = eventType;
		TTD.currentEvent.eventData = createEventData(eventType);
		TTD.currentEvent.eventId = getNextEventId();
		TTD.debug('TTD: ' + $.toJSON(TTD));
	} catch (e) {
		TTD.error("JS UNCAUGHT ERROR: " + e.message);
	}
});

$("#addUsersPage").live('pagebeforeshow', function(event, ui) {
	userTmplData = [];
	var i = 0;
	$.each(TTD.users,  function(name, field) {
		userTmplData[i] = {};
		userTmplData[i].i = i;
		userTmplData[i].name = name;
		userTmplData[i].letter = name.charAt(0).toUpperCase();
		userTmplData[i].newLetter = (i == 0 || (userTmplData[i].letter != userTmplData[i-1].letter))? true : false;
		i++;
	});
	
	$("#addUsersList").html('');
	$("#addUsersListTemplate").tmpl(userTmplData).appendTo( "#addUsersList" );
	$("#addUsersList").listview("refresh");
	$("#addUsersList input[type='checkbox']").checkboxradio();
	
	if(TTD.currentEvent.eventType == TTD.eventTypeEnum.TRANSFER) {
		$("a.submit", this).attr("href", "#transferPage");
	} else {
		$("a.submit", this).attr("href", "#fillExpensePage");
	}
});

$("#addUsersPage .submit").live('click', function(e) {
	var scope = $("#addUsersPage");
	//save users selected
	var names = $("ul:jqmData(role='listview') input:checked", scope).map(function() {
		return $(this).val();
	}).get();
	names.unshift("Me");
	if(!names.length)
		return stop(e);
	var users = [];
	$.each(names, function(i, value) {
		users.push(new TTD.eventData[TTD.currentEvent.eventType].user(value));
	});
	TTD.currentEvent.eventData.users = users;
	TTD.debug('TTD: ' + $.toJSON(TTD));
});

$("#fillExpensePage").live('pagebeforeshow', function(event, ui) {
	//populate form data from previous choices
});

$("#fillExpensePage .submit").live('click', function(e) {
	//// save form data from fillExpensePage
	var inputs = getFormInputs("#fillExpenseForm");
	if (!inputs.total) {
		TTD.error('enter a total amount or choose to itemize');
		return stop(e);
	}
	TTD.debug('form inputs: ' + $.toJSON(inputs));
	var eventData = processEventDataFromFillExpense(inputs, TTD.currentEvent.eventData);
	if(!eventData)
		return stop(e);
	TTD.currentEvent.eventData = eventData;
	TTD.debug('fillExpensePage currentEvent before editExpense page population: ' + $.toJSON(TTD.currentEvent));

	populateEditEventPage();
});

$("#editExpensePage .submit").live('click', function(e) {
	TTD.debug("saving event: " + $.toJSON(TTD.currentEvent));
	saveEventDataFromEditExpensePage("#editExpensePage");
	persistAndSyncEvent();
});

$(".deleteHistory").live('click', function(e) {
	var bool = confirm("Delete Event History?");
	if(bool) {
		TTD.eventHistory = [];
		$.DSt.set('TTD.eventHistory',TTD.eventHistory);
		$( "#eventHistory" ).html('');
	}
});

$("#eventHistoryPage li[id|='event']").live('click', function(e) {
	var eventId = $(this).attr('id').split('-')[1];
	if(isNaN(eventId)) {
		TTD.debug("can't get event id");
		return stop(e);
	}
	TTD.currentEvent = TTD.eventHistory[eventId];
	TTD.currentEvent.eventId = eventId;
	TTD.currentEvent.isHistorical = true;
	populateEditEventPage(eventId);
});

$("#eventHistoryPage").live('pagebeforeshow', function(event, ui) {
	$( "#eventHistory" ).html('');
	var eventTmplData = [];
	$.each(TTD.eventHistory,  function(i, field) {
		eventTmplData[i] = {};
		eventTmplData[i].i = i;
		eventTmplData[i].date = new Date(field.date).toDateString(); //TODO maybe do this date restoration from localStorage in setEventHistory instead
		eventTmplData[i].location = field.location;
		switch (field.eventType) {
			case TTD.eventTypeEnum.GROUP:
				eventTmplData[i].total = "$" + (field.eventData.subtotal + field.eventData.tax + field.eventData.tip).toFixed(2);
				eventTmplData[i].type = "Group Expense";
				eventTmplData[i].users = _.pluck(field.eventData.users, 'name').join(", ");
				eventTmplData[i].linkToPage = "#editExpensePage";
				break;
			case TTD.eventTypeEnum.PERSONAL:
				eventTmplData[i].total = "$" + (field.eventData.subtotal + field.eventData.tax + field.eventData.tip).toFixed(2);
				eventTmplData[i].type = "Personal Expense";
				eventTmplData[i].users = false;
				eventTmplData[i].linkToPage = "#editExpensePage";
				break;
			case TTD.eventTypeEnum.TRANSFER:
				var total = 0;
				$.each(field.eventData.users,  function(i, field) {
					total += Math.abs(field.amount);
				});
				eventTmplData[i].total = "$" + (total).toFixed(2);
				eventTmplData[i].type = "Transfer";
				eventTmplData[i].users = _.pluck(field.eventData.users, 'name').join(", ");
				eventTmplData[i].linkToPage = "#transferPage";
				break;
			default:
				TTD.error('invalid eventType in eventHistory');
		}
	});
	$("#eventHistoryTemplate").tmpl(eventTmplData).appendTo( "#eventHistory" ).page();
	$( "#eventHistory" ).listview('refresh');
	
	//filter events if coming from userHistory page
	$("input:jqmData(type='search')", this).val(TTD.filter).trigger('change');
	TTD.filter = '';
});

$("#selectGroupUsersPage li[id|='groupusers']").live('click', function(e) {
	var eventId = $(this).attr('id').split('-')[1];
	if(isNaN(eventId)) {
		TTD.debug("can't get event id");
		return stop(e);
	}
	var users = [];
	var names = _.pluck(TTD.eventHistory[eventId].eventData.users, 'name');
	$.each(names, function(i, value) {
		users.push(new TTD.eventData[TTD.currentEvent.eventType].user(value));
	});
	TTD.currentEvent.eventData.users = users;
});

$("#selectGroupUsersPage").live('pagebeforeshow', function(event, ui) {
	$( "#previousGroupUsers" ).html('');
	var eventTmplData = [];
	$.each(TTD.eventHistory,  function(i, field) {
		switch (field.eventType) {
			case TTD.eventTypeEnum.GROUP:
				eventTmplData[i] = {};
				eventTmplData[i].i = i;
				eventTmplData[i].date = new Date(field.date).toDateString(); //TODO maybe do this date restoration from localStorage in setEventHistory instead
				eventTmplData[i].users = _.pluck(field.eventData.users, 'name').join(", ");
				break;
			case TTD.eventTypeEnum.PERSONAL:
				// don't show personal events in group users list
				break;
			default:
				TTD.error('invalid eventType in selectGroupUsersPage');
		}
	});
	$("#previousGroupUsersTemplate").tmpl(eventTmplData).appendTo( "#previousGroupUsers", this ).page();
	$( "#previousGroupUsers", this ).listview('refresh');
});

$("#manualPaymentAmountsLink").live('click', function(event, ui) {
	saveEventDataFromEditExpensePage("#editExpensePage");
	$("#adjustPayTable").html('');
	// div created and destroyed so we can call .page() on it.
	// you can only call page() once on an element so this solves the issue.
	$("#adjustPayTable").append("<div></div>");
	tmplData = [];
	$.each(TTD.currentEvent.eventData.users,  function(i, field) {
		tmplData[i] = {};
		tmplData[i].i = i;
		tmplData[i].name = field.name;
		tmplData[i].value = field.paying;
	});
	$("#adjustPayTableTemplate").tmpl(tmplData).appendTo( "#adjustPayTable > div" );
	$( "#adjustPayTable > div" ).page();
});

$("#manualPaymentAmountsPage .submit").live('click', function(e) {
	var inputs = getFormInputs("#adjustPayTable");
	var eventData = TTD.currentEvent.eventData;
	for(var name in inputs){
		var userId = name.split('-')[1];
		eventData.users[userId].paying = inputs[name];
	}
	TTD.currentEvent.eventData = eventData;
	updatePayingLabelsFromCurrentEvent("#editExpensePage");
	 
	/* TODO
	// adjust other owes fields to sum to subtotal if they haven't been manually set
	var eventData = TTD.currentEvent.eventData;
	var inputNodeId = $(inputNode).attr('id').split('-')[1];
	eventData.users[inputNodeId].manualOwes = true;
	var sumManual = 0;
	var arrAuto = [];
	$(eventData.users).each(function(i, field) {
		if(field.manualOwes)
			sumManual += parseFloat($("#owes-"+i, scope).val());
		else
			arrAuto.push(i);
	});
	if(arrAuto.length > 0) {
		var owesAuto = (eventData.subtotal - sumManual)/arrAuto.length;
		for(var i in arrAuto) {
			$("#owes-"+arrAuto[i]).val(owesAuto);
		}
	}
	TTD.currentEvent.eventData = eventData;
	
	// display warning if sum of paying > total
	if(sum != subtotal) {
		$("input[id|='owes']", scope).parent().addClass("inputError");
		var owesMsg = 'owing $' + sum.toFixed(2) + ' of $' + subtotal.toFixed(2);
		displayOwesPayingWarning(owesMsg, '', scope);
	} else {
		$("input[id|='owes']", scope).parent().removeClass("inputError");
		$( "#expenseGridUsers .owepaywarn", scope ).remove();
	}
	*/
});

$("#userHistoryPage").live('pagebeforeshow', function(event, ui) {
	$( "#userHistory" ).html('');
	var eventTmplData = [];
	var i=0;
	$.each(TTD.users,  function(name, field) {
		if(field.balance != 0) {
			eventTmplData[i] = {};
			eventTmplData[i].i = i;
			eventTmplData[i].name = name;
			eventTmplData[i].color = (field.balance >= 0 ? "green" : "red");
			eventTmplData[i].balance = "$ " + (field.balance).toFixed(2);
			i++;
		}
	});
	$("#userHistoryTemplate").tmpl(eventTmplData).appendTo( "#userHistory" ).page();
	$("#userHistory").listview('refresh');
	
	// setup filtering on eventHistory page when a user on this page is clicked
	$("li.filter", this).click(function() {
		var userId = $(this).attr('id').split('-')[1];
		TTD.filter = TTD.users[userId].name;
	});
});

$("#transferPage").live('pagebeforeshow', function(event, ui) {
	$("#transferForm").html('');
	var eventTmplData = [];
	$.each(TTD.currentEvent.eventData.users,  function(i, field) {
		if(field.name != "Me") {
			eventTmplData[i] = {};
			eventTmplData[i].i = i;
			eventTmplData[i].name = field.name;
			eventTmplData[i].amount = field.amount.toFixed(2);
			eventTmplData[i].selectPay = (field.amount > 0 ? "selected" : "");
			eventTmplData[i].selectRec = (field.amount < 0 ? "selected" : "");
		}
	});
	$("#transferTemplate").tmpl(eventTmplData).appendTo("#transferForm").page();
	var myswitch = $("select", this);
	myswitch.slider("refresh");
	$('.currency').currencyFormat();
});

$("#transferPage .submit").live('click', function(e) {
	// inputs: {"transferDirection-1":1,"transferAmount-1":0,"transferDirection-2":-1,"transferAmount-2":0,"transferDirection-3":1,"transferAmount-3":0}
	var scope = $("#transferPage");
	var amounts = {};
	$("select[name|='transferDirection']", scope).each(function(){
		var userId = $(this).attr('name').split('-')[1];
		var val = $(this).val();
		amounts[userId] = val * $("input[name='transferAmount-" + userId + "']", scope).val();
	});
	for(var userId in amounts) {
		TTD.currentEvent.eventData.users[userId].amount = amounts[userId];
	}
	TTD.debug('transferPage submit amounts: ' + $.toJSON(TTD.currentEvent.eventData.users));
	TTD.currentEvent.notes = $("#notes", scope).val();
	persistAndSyncEvent();
});

/***********************************************************************************
 * PAGE SUPPORTING METHODS
 ***********************************************************************************/

function persistAndSyncEvent() {
	$.mobile.pageLoading(); // show jquerymobile loading message
	calculateBalance(true);
	persistEvent(TTD.currentEvent);
	TTD.currentEvent = {};
	// TODO sync to server
	$.mobile.pageLoading(true); // hide jquerymobile loading message
	TTD.debug("event saved: " + $.toJSON(TTD.eventHistory));
}

/**
 * calculate user history balance
 * @param allEvents - if true calculate balance for all history 
 *                  - if false just recalc balance with the additional current event
 * TODO this needs to update events that were edited properly rather than only new events
 * 		maybe add a balance to eventData.users for all events and then subtract the balance
 * 		before adding the new balance which would be added to the TTD.user balance 
 * 		and the eventData.user balance
 */
function calculateBalance(allEvents) {
	var currEventData = TTD.currentEvent.eventData;
	if(TTD.currentEvent.eventType == TTD.eventTypeEnum.GROUP) {
		var total = currEventData.subtotal + currEventData.tax + currEventData.tip;
		var users = {};
		var sumOwes = 0;
		$(currEventData.users).each(function(i, field) {
			sumOwes += field.owes;
			users[field.name] = {paying: field.paying, owes: field.owes};
		});
		var sumNetPos = 0;
		for(var name in users) {
			var owesWithTaxTip = users[name].owes/sumOwes * total;
			var net = users[name].paying - owesWithTaxTip;
			if(net > 0)
				sumNetPos += net;
			users[name].net = net;
		}
		var me = users['Me'];
		delete users['Me']; // remove Me from users
		for(var name in users) {
			if(me.net * users[name].net < 0) { // only calc where user is owed/owing me
				var owesMe = me.net * Math.abs(users[name].net) / sumNetPos;
				var currEventBalance = _.detect(currEventData.users, function(user) { return user.name == this; }, name).balance;
				if(TTD.currentEvent.isHistorical)
					TTD.users[name].balance -= currEventBalance;
				currEventBalance = owesMe; //update current event balance
				TTD.users[name].balance += owesMe; //update running user balance across all events
			}
		}
		TTD.debug('calculateBalance me: '+$.toJSON(me));
	} else if (TTD.currentEvent.eventType == TTD.eventTypeEnum.TRANSFER) {
		$(currEventData.users).each(function(i, field) {
			if(field.name != "Me") {
				if(TTD.currentEvent.isHistorical)
					TTD.users[field.name].balance -= field.balance;
				field.balance = -1*field.amount; //update current event balance
				TTD.users[field.name].balance += field.balance; //update running user balance across all events
			}
		});
	} else if (TTD.currentEvent.eventType == TTD.eventTypeEnum.PERSONAL) {
		// skip
	} else
		TTD.error("calculateBalance not implemented for eventType " + TTD.currentEvent.eventType);
	//TODO function to do this for all events in history at once
	
	TTD.debug('calculateBalance users: '+$.toJSON(TTD.users));
}

function getNextEventId() {
	return TTD.eventHistory.length;
}

/**
 * populate form data for editExpensePage etc from TTD.currentEvent
 */
function populateEditEventPage() {
	var event = TTD.currentEvent;
	switch (event.eventType) {
		case TTD.eventTypeEnum.GROUP:
			populateEditExpensePageUsers(event.eventData);
			$("#editExpensePage #editGroupExpense").removeClass('hidden');
			$("#editExpensePage #editPersonalExpense").addClass('hidden');
			populateEditExpensePageTotals(event.eventData);
			break;
		case TTD.eventTypeEnum.PERSONAL:
			$("#editExpensePage #editGroupExpense").addClass('hidden');
			$("#editExpensePage #editPersonalExpense").removeClass('hidden');
			populateEditExpensePageTotals(event.eventData);
			break;
		case TTD.eventTypeEnum.TRANSFER:
			break;
		default:
			TTD.error("eventType not recognized in populateEditEventPage");
	}
	
	$('.currency').currencyFormat();
	$('.currency0').currencyFormat(0);
}

function populateEditExpensePageUsers(event) {
	var usersLength = event.users.length;
	var userTmplData = [];
	$.each(event.users,  function(i, field) {
		TTD.currentEvent.eventData.users[i].owes = event.subtotal / usersLength;
		userTmplData[i] = {};
		userTmplData[i].i = i;
		userTmplData[i].name = field.name;
		userTmplData[i].owes = (field.owes ? field.owes : event.subtotal / usersLength).toFixed(2);
		userTmplData[i].paying = "$" + (field.paying ? field.paying : 0).toFixed(2);
		userTmplData[i].payingChecked = (field.paying > 0);
	});
	$( "#expenseGridUsers" ).html('');
	$("#editExpenseUserTemplate").tmpl(userTmplData).appendTo( "#expenseGridUsers" ).page();
	$("#editExpensePage #expenseGridUsers input[id|='owes']").recalcEditExpensePage("#editExpensePage", onChangeEditExpensePageOwes);
	$("#editExpensePage #expenseGridUsers input[id|='paying']").recalcEditExpensePage("#editExpensePage", onChangeEditExpensePagePaying);
}

function populateEditExpensePageTotals(event) {
	var taxPercent = 0;
	if (event.tax)
		taxPercent = event.tax / event.subtotal * 100;
	var tipPercent = 0;
	if (event.tip)
		tipPercent = event.tip / event.subtotal * 100;
	var total = Number(event.subtotal) + Number(event.tax) + Number(event.tip); // hehe ok here static typing might help...
	$("#editExpensePage #subtotal").val(event.subtotal);
	$("#editExpensePage #taxPercent").val(taxPercent);
	$("#editExpensePage #taxValue").val(event.tax);
	$("#editExpensePage #tipPercent").val(tipPercent);
	$("#editExpensePage #tipValue").val(event.tip);
	$("#editExpensePage #total").val(total);
	$("#editExpensePage .expenseGridTotals input").recalcEditExpensePage("#editExpensePage", onChangeEditExpensePageTotals);
}

function restoreEventHistory() {
	//TODO restore dates as new Date()
	var eventHistory = $.DSt.get('TTD.eventHistory');
	if(!eventHistory)
		eventHistory = [];
	TTD.eventHistory = eventHistory;
}

function persistEvent(event) {
	event.date = (new Date()).getTime();
	if(!TTD.eventHistory)
		TTD.eventHistory = [];
	var eventDeepClone = $.extend(true, {}, event); // see http://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-clone-a-javascript-object
	eventDeepClone.isHistorical = true;
	var eventId = event.eventId;
	TTD.eventHistory[eventId] = eventDeepClone;
	$.DSt.set('TTD.eventHistory',TTD.eventHistory);
}

/**
 * save and recalculate editExpensePage fields when one of them changes
 * use: $(selectorOfElementsToWatch).recalcEditExpensePage(optionalPageScope);
 * $("#editExpensePage input").recalcEditExpensePage("#editExpensePage", recalcFunction);
 */
(function($) {
    $.fn.recalcEditExpensePage = function(scope, recalc) {
        this.each( function( i ) {
            $(this).change( function( e ){
            	recalc(this, scope);
            	saveEventDataFromEditExpensePage(scope);
            	TTD.debug("recalcEditExpense eventData: " + $.toJSON(TTD.currentEvent.eventData));
            });
        });
        return this; //for chaining
    };
})( jQuery );

function onChangeEditExpensePageOwes(inputNode, scope) {
	TTD.debug('owes changed');
	
	// adjust other owes fields to sum to subtotal if they haven't been manually set
	var eventData = TTD.currentEvent.eventData;
	var inputNodeId = $(inputNode).attr('id').split('-')[1];
	eventData.users[inputNodeId].manualOwes = true;
	var sumManual = 0;
	var arrAuto = [];
	$(eventData.users).each(function(i, field) {
		if(field.manualOwes)
			sumManual += parseFloat($("#owes-"+i, scope).val());
		else
			arrAuto.push(i);
	});
	if(arrAuto.length > 0) {
		var owesAuto = (eventData.subtotal - sumManual)/arrAuto.length;
		for(var i in arrAuto) {
			$("#owes-"+arrAuto[i]).val(owesAuto);
		}
	}
	TTD.currentEvent.eventData = eventData;
	
	// display warning if owes doesn't add up to subtotal
	var sum = 0;
	$("input[id|='owes']", scope).each(function(){
	    sum += parseFloat(this.value);
	});
	var subtotal = parseFloat($("#subtotal", scope).val());
	if(sum != subtotal) {
		$("input[id|='owes']", scope).parent().addClass("inputError");
		var owesMsg = 'owing $' + sum.toFixed(2) + ' of $' + subtotal.toFixed(2);
		displayOwesPayingWarning(owesMsg, '', scope);
	} else {
		$("input[id|='owes']", scope).parent().removeClass("inputError");
		$( "#expenseGridUsers .owepaywarn", scope ).remove();
	}
	
	// update paying ratios to match if they haven't been manually set
	updatePayingLabels(scope);
}

function onChangeEditExpensePagePaying(inputNode, scope) {
	TTD.debug('paying changed');
	if (!$(inputNode).prop('checked'))
		$(inputNode).parent().find("label .ui-btn-text").text("$0.00");
	updatePayingLabels(scope);
}

function onChangeEditExpensePageTotals(inputNode, scope) {
	TTD.debug('totals changed');
	// below is a great candidate for backbone.js to avoid getting the values from dom and then having to put them back
	var subtotal, taxValue, taxPercent, tipValue, tipPercent, total;
	subtotal = parseFloat($("#subtotal", scope).val());
	taxValue = parseFloat($("#taxValue", scope).val());
	taxPercent = parseFloat($("#taxPercent", scope).val())/100;
	tipValue = parseFloat($("#tipValue", scope).val());
	tipPercent = parseFloat($("#tipPercent", scope).val())/100;
	total = parseFloat($("#total", scope).val());
	// note the following code could change for other countries in the future
	// assume event data was saved after the last change so no other changes have occured before this one
	switch ($(inputNode).attr('id')) {
		case "subtotal":
			//update taxValue, tipValue, total
			taxValue = subtotal * taxPercent;
			tipValue = subtotal * tipPercent;
			total = subtotal + taxValue + tipValue;
			break;
		case "taxValue":
			//update taxPercent, total
			taxPercent = taxValue / subtotal;
			total = subtotal + taxValue + tipValue;
			break;
		case "taxPercent":
			//update taxValue, total
			taxValue = subtotal * taxPercent;
			total = subtotal + taxValue + tipValue;
			break;
		case "tipValue":
			//update tipPercent, total
			tipPercent = tipValue / subtotal;
			total = subtotal + taxValue + tipValue;
			break;
		case "tipPercent":
			//update tipValue, total
			tipValue = subtotal * tipPercent;
			total = subtotal + taxValue + tipValue;
			break;
		case "total":
			//update tipValue, tipPercent
			tipValueTemp = total - subtotal - taxValue;
			if(tipValueTemp < 0) {
				TTD.error("total cannot be less than subtotal plus tax");
				return;
			}
			tipValue = tipValueTemp;
			tipPercent = tipValue / subtotal;
			break;
		default:
			TTD.debug("edit expense page totals input node not recognized");
			break;
	}
	$("#subtotal", scope).val(subtotal.toFixed(2));
	$("#taxValue", scope).val(taxValue.toFixed(2));
	$("#taxPercent", scope).val((taxPercent*100).toFixed(0));
	$("#tipValue", scope).val(tipValue.toFixed(2));
	$("#tipPercent", scope).val((tipPercent*100).toFixed(0));
	$("#total", scope).val(total.toFixed(2));
	
	//update paying amounts to reflect the changes to totals
	if(TTD.currentEvent.eventType == TTD.eventTypeEnum.GROUP) {
		updatePayingLabels(scope);
	}
}

function displayOwesPayingWarning(owesMsg, payingMsg, scope) {
	$( "#expenseGridUsers .owepaywarn", scope ).remove(); //remove the message if it already exists
	var userTmplData = {};
	userTmplData.owesWarning = owesMsg;
	userTmplData.payingWarning = payingMsg;
	$("#editExpenseOwesPayingErrorTemplate").tmpl(userTmplData).appendTo( "#expenseGridUsers", scope ).page();
}

function updatePayingLabels(scope) {
	var total = $("#total", scope).val();
	var checked = $("input[id|='paying']:checked", scope);
	var totalOwes = 0;
	$("input[id|='owes']", scope).each(function(){
		var id = $(this).attr('id').split("-")[1];
		if ($("#paying-" + id, scope).prop('checked'))
				totalOwes += parseFloat($(this).val());
	});
	$.each(checked,  function(i, field) {
		var id = $(field).attr('id').split("-")[1];
		var owes = $("#owes-" + id, scope).val();
		var label = $(this).parent().find("label .ui-btn-text");
		var paying = totalOwes == 0 ? 0 : total * owes/totalOwes;
		//if (!TTD.currentEvent.eventData.users[id].payingManual) TODO
			label.text("$"+(paying).toFixed(2));
	});
}

function updatePayingLabelsFromCurrentEvent(scope) {
	$.each(TTD.currentEvent.eventData.users, function(i, field) {
		$("#paying-" + i, scope).parent().find("label .ui-btn-text").text("$" + (field.paying ? field.paying : 0).toFixed(2));
		if(field.paying > 0) {
			TTD.currentEvent.eventData.users[i].manualPaying = true;
			var checked = $("#paying-" + i, scope).prop('checked', true).checkboxradio("refresh");
		} else {
			TTD.currentEvent.eventData.users[i].manualPaying = false;
			var unchecked = $("#paying-" + i, scope).prop('checked', false).checkboxradio("refresh");
		}
	});
	TTD.debug('TTD.currentEvent.eventData: ' + $.toJSON(TTD.currentEvent.eventData));
}

/**
 * save editExpensePage fields to TTD.currentEvent.eventData.  note persistence is a separate operation.
 * @param scope
 * @param eventData
 */
function saveEventDataFromEditExpensePage(scope) {
	var eventData = TTD.currentEvent.eventData;
	eventData.subtotal = parseFloat($("#subtotal", scope).val());
	eventData.tax = parseFloat($("#taxValue", scope).val());
	eventData.tip = parseFloat($("#tipValue", scope).val());
	TTD.currentEvent.notes = $("#notes", scope).val();
	if(TTD.currentEvent.eventType == TTD.eventTypeEnum.GROUP) {
		var tempEventData = eventData; // .each needs an immutable array
		$.each(tempEventData.users, function(i, field) {
			eventData.users[i].owes = parseFloat($("#owes-" + i, scope).val());
			eventData.users[i].paying = parseFloat($("#paying-" + i, scope).parent().find("label .ui-btn-text").text().substring(1));
		});
	}
	TTD.currentEvent.eventData = eventData;
}

/**
 * Create eventData given eventType
 * @returns eventData object, null on failure
 */
function createEventData(eventType) {
	if(!eventType) {
		TTD.error('eventType is unknown');
		return null;
	}
	var newEventData = $.extend(true, {}, TTD.eventData[eventType]); //deep clone
	return newEventData;
}

/**
 * process data from fill expense form for population into eventData object
 * @param inObj object containing form input key value pairs
 * @param outObj eventData object to be populated
 * @returns outObj eventData object on success, null on failure
 */
function processEventDataFromFillExpense(inObj, outObj) {
	// TODO clean up repetitive code
	//inObj: "totalType":"subtotal","total":"10","includeTip":"1","tipType":"percent","tip":"15"
	// find subtotal
	switch (inObj.totalType) {
		case "subtotal":
			outObj.subtotal = inObj.total;
			if (inObj.includeTip == 1 && inObj.tip) {
				if (inObj.tipType == TTD.amountTypeEnum.VALUE)
					outObj.tip = inObj.tip;
				else //tipType == percent
					outObj.tip = outObj.subtotal * inObj.tip/100;
			} else { // no tip
				outObj.tip = 0;
			}
			outObj.tax = outObj.subtotal * TTD.settings.taxRate;
			break;
		case "total": // subtotal + tax; total = subtotal * (1 + taxRate)
			outObj.subtotal = inObj.total / (1 + TTD.settings.taxRate);
			if (inObj.includeTip == 1 && inObj.tip) {
				if (inObj.tipType == TTD.amountTypeEnum.VALUE)
					outObj.tip = inObj.tip;
				else //tipType == percent
					outObj.tip = outObj.subtotal * inObj.tip/100;
			} else { // no tip
				outObj.tip = 0;
			}
			outObj.tax = outObj.subtotal * TTD.settings.taxRate;
			break;
		case "totalTip": // subtotal + tax + tip
			if (inObj.tipType == TTD.amountTypeEnum.VALUE && inObj.tip > inObj.total) {
				TTD.error('tip cannot be greater than total with tip.  please correct the fields.');
				return null;
			}
			if (inObj.includeTip == 1 && inObj.tip) {
				if (inObj.tipType == TTD.amountTypeEnum.VALUE) {
					outObj.tip = inObj.tip;
					var total = inObj.total - inObj.tip;
					outObj.subtotal = total / (1 + TTD.settings.taxRate);
					outObj.tax = outObj.subtotal * TTD.settings.taxRate;
				} else { //tipType == percent
					// totalTip = subtotal * (1 + tip + tax)
					outObj.subtotal = inObj.total / (1 + TTD.settings.taxRate + inObj.tip/100);
					outObj.tax = outObj.subtotal * TTD.settings.taxRate;
					outObj.tip = outObj.subtotal * inObj.tip/100;
					break;
				}
			} else {
				outObj.tip = 0;
				// total = subtotal + tax; total = subtotal * (1 + taxRate)
				outObj.subtotal = inObj.total / (1 + TTD.settings.taxRate);
				outObj.tax = outObj.subtotal * TTD.settings.taxRate;
			}
			break;
		default:
			TTD.error("no recognized totalType");
	}
	return outObj;
}

/***********************************************************************************
 * UTILITY METHODS
 ***********************************************************************************/

TTD.debug = function(string) {
	string = 'JS DEBUG: ' + string;
	if(TTD.config.debug) { 
		if(console != null)
			console.log(string);
		else
			alert(string);
	}
};

TTD.error = function(string) {
	string = 'JS ERROR: ' + string;
	if(console != null && TTD.config.debug)
		console.log(string);
	else
		alert(string);
};

/**
 * get array of form elements with their names and values.
 * @param formSelector (must be explicit: #someForm)
 * @returns {input key value pairs}
 */
function getFormInputs(formSelector) {
	var inputs = {};
	$.each($(formSelector).serializeArray(), function(i, field) {
		inputs[field.name] = isNaN(field.value) ? field.value : parseFloat(field.value);
	});
	return inputs;
}

/**
 * stop all handlers and event bubbling on click.  do nothing.
 */
function stop(e) {
	e.preventDefault();
	e.stopImmediatePropagation();
	return false;
}

//jQuery plugin that formats to two decimal places
//when called and onChange
(function($) {
 $.fn.currencyFormat = function(decimalPlaces) {
 	if(decimalPlaces == null)
 		decimalPlaces = 2;
     this.each( function( i ) {
     	if( !isNaN( parseFloat( this.value ) ) )
     		this.value = Math.abs(parseFloat(this.value)).toFixed(decimalPlaces);
         $(this).change( function( e ){
             if( isNaN( parseFloat( this.value ) ) ) return;
             this.value = Math.abs(parseFloat(this.value)).toFixed(decimalPlaces);
         });
     });
     return this; //for chaining
 };
})( jQuery );

function isPhonegap() { 
    if (window.Device !== undefined) { 
       return true; 
   } else { 
       return false; 
   } 
}

//http://elegantcode.com/2011/01/26/basic-javascript-part-8-namespaces/
function namespace(namespaceString) {
    var parts = namespaceString.split('.'),
        parent = window,
        currentPart = '';    

    for(var i = 0, length = parts.length; i < length; i++) {
        currentPart = parts[i];
        parent[currentPart] = parent[currentPart] || {};
        parent = parent[currentPart];
    }

    return parent;
}

function sortObj(arr){
	// Setup Arrays
	var sortedKeys = new Array();
	var sortedObj = {};

	// Separate keys and sort them
	for (var i in arr){
		sortedKeys.push(i);
	}
	sortedKeys.sort();

	// Reconstruct sorted obj based on keys
	for (var i in sortedKeys){
		sortedObj[sortedKeys[i]] = arr[sortedKeys[i]];
	}
	return sortedObj;
}