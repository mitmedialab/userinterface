/**
 * Memory Bar
 *
 * Allows user creation and selection of memories (images of objects that allow interaction).
 * Sends of://memorize and of://remember/?data=%d. Receives receiveThumbnail with
 * memory image thumbnail.
 */

(function(exports) {
function MemoryContainer(element) {
    this.element = element;
    this.image = null;
    this.memory = null;
    this.dragging = false;
    this.dragTimer = null;

    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerEnter = this.onPointerEnter.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointerenter', this.onPointerEnter);
}

MemoryContainer.prototype.set = function(obj) {
    this.obj = obj;
    var urlBase = 'http://' + obj.ip + ':8080/obj/' + obj.name + '/memory/';
    var image = urlBase + 'memory.jpg';
    var thumbnail = urlBase + 'memoryThumbnail.jpg';

    this.memory = {
        id: obj.objectId,
        image: image,
        thumbnail: thumbnail,
        matrix: obj.memory.matrix
    };
    this.element.dataset.objectId = this.memory.id;

    if (!this.image) {
        this.createImage();
    }

    this.element.classList.add('memoryPlaceholder');

    this.image.onload = function() {
        this.element.classList.remove('memoryPlaceholder');
        this.image.classList.add('memoryLoaded');
    }.bind(this);
    this.image.src = thumbnail;
};

MemoryContainer.prototype.clear = function() {
    this.obj = null;
    this.memory = null;
    this.removeImage();
    delete this.element.dataset.objectId;
};

MemoryContainer.prototype.removeImage = function() {
    this.image.parentNode.removeChild(this.image);
    this.image.removeEventListener('touchstart', this.onTouchStart);
    this.image.removeEventListener('touchmove', this.onTouchMove);
    this.image.removeEventListener('touchend', this.onTouchEnd);
    this.image = null;
};

MemoryContainer.prototype.onTouchStart = function(event) {
    this.lastTouch = {
        left: event.touches[0].clientX,
        top: event.touches[0].clientY
    };

    this.dragTimer = setTimeout(function() {
        this.startDragging();
    }.bind(this), 100);
};

MemoryContainer.prototype.startDragging = function() {
    if (!this.memory) {
        return;
    }
    this.dragging = true;

    var rect = this.image.getBoundingClientRect();
    this.image.classList.add('memoryDragging');
    this.image.style.transform = 'translate(' + rect.left + 'px,' + rect.top + 'px)';

    this.image.parentNode.removeChild(this.image);
    document.querySelector('.memoryDragContainer').appendChild(this.image);

    this.dragDelta = {
        top: rect.top - this.lastTouch.top,
        left: rect.left - this.lastTouch.left
    };

    var isBar = barContainers.indexOf(this) >= 0;

    if (isBar) {
        pocketOnMemoryDeletionStart();
    } else {
        pocketOnMemoryCreationStart();
    }
};

MemoryContainer.prototype.onTouchMove = function() {
    var touch = {
        left: event.touches[0].clientX,
        top: event.touches[0].clientY
    };

    if (this.dragging) {
        var top = touch.top + this.dragDelta.top + 'px';
        var left = touch.left + this.dragDelta.left + 'px';
        this.image.style.transform = 'translate(' + left + ',' + top + ')';
    }
};

MemoryContainer.prototype.stopDragging = function() {
    if (!this.dragging) {
        return;
    }
    this.dragging = false;

    var isBar = barContainers.indexOf(this) >= 0;

    if (isBar) {
        pocketOnMemoryDeletionStop();
    } else {
        pocketOnMemoryCreationStop();
    }

    var imageRect = this.image.getBoundingClientRect();

    if (this.image) {
        this.image.style.transform = '';
        this.image.classList.remove('memoryDragging');
        this.image.parentNode.removeChild(this.image);
        this.element.appendChild(this.image);
    }

    if (isBar) {
        var rightMostContainer = barContainers[barContainers.length - 1];
        if (imageRect.left - this.dragDelta.left > rightMostContainer.element.getBoundingClientRect().right) {
            this.clear();
            return;
        }
    }

    var containerRect = this.element.getBoundingClientRect();

    if (isBar) {
        // Move requested
        if (imageRect.right < containerRect.left || imageRect.left > containerRect.right) {
            var newContainer = getBarContainerAtLeft(imageRect.left);
            if (newContainer) {
                newContainer.set(this.obj);
                this.clear();
            }
        }
    } else {
        // Move into bar
        if (imageRect.top < memoryBarHeight) {
            var newContainer = getBarContainerAtLeft(imageRect.left);
            if (newContainer) {
                newContainer.set(this.obj);
            }
        } else {
            // Didn't move into bar, pocket should close
            pocketHide();
        }
    }
};

MemoryContainer.prototype.onPointerUp = function() {
    if (this.dragTimer) {
        clearTimeout(this.dragTimer);
        this.dragTimer = null;
    }

    if (activeThumbnail) {
        if (!this.image) {
            this.createImage();
        }
        this.image.src = activeThumbnail;
        this.element.classList.add('memoryPlaceholder');

        overlayDiv.style.backgroundImage = 'none';
        overlayDiv.classList.remove('overlayMemory');
        overlayDiv.classList.remove('overlayMemoryInstant');
        overlayDiv.style.visibility = 'hidden';
        activeThumbnail = '';
        var potentialObjects = Object.keys(globalObjects);
        if (potentialObjects.length !== 1) {
            console.warn('Memorization attempted with multiple objects');
        } else {
            pendingMemorizations[potentialObjects[0] || ''] = this;
            window.location.href = 'of://memorize';
            event.stopPropagation();
        }
        pocketOnMemoryCreationStop();
    } else if (this.dragging) {
        return;
    } else if (this.memory) {
        this.remember();
    }
};

MemoryContainer.prototype.onPointerEnter = function() {
    if (overlayDiv.classList.contains('overlayMemory')) {
        return;
    }
    if (this.dragTimer) {
        return;
    }
    if (!this.memory) {
        return;
    }
    this.remember();
};

MemoryContainer.prototype.onTouchEnd = function() {
    // Defer stopping to the next event loop when onPointerUp will have already
    // occurred.
    setTimeout(function() {
        this.stopDragging();
    }.bind(this), 0);
};


MemoryContainer.prototype.remember = function() {
    if (document.querySelector('.memoryWeb')) {
        removeMemoryWeb();
    }

    pocketHide();

    var memoryBackground = document.querySelector('.memoryBackground');
    memoryBackground.style.backgroundImage = url(this.memory.image);
    window.location.href = 'of://remember/?data=' + encodeURIComponent(JSON.stringify(
        {id: this.memory.id, matrix: this.memory.matrix}
    ));
    document.getElementById('freezeButton').src = freezeButtonImage[2].src;
    globalStates.freezeButtonState = true;
};

MemoryContainer.prototype.remove = function() {
    this.element.parentNode.removeChild(this.element);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointerenter', this.onPointerEnter);
    this.removeImage();
};

MemoryContainer.prototype.createImage = function() {
    this.image = document.createElement('img');
    this.image.classList.add('memory');
    this.image.addEventListener('touchstart', this.onTouchStart);
    this.image.addEventListener('touchmove', this.onTouchMove);
    this.image.addEventListener('touchend', this.onTouchEnd);

    this.element.appendChild(this.image);
};


var activeThumbnail = '';
var barContainers = [];
var pendingMemorizations = {};
var memoryBarHeight = 80;

function getBarContainerAtLeft(left) {
    // Assumes bar containers are in order of DOM insertion
    for (var i = 0; i < barContainers.length; i++) {
        var barContainer = barContainers[i];
        var barRect = barContainer.element.getBoundingClientRect();
        if (left > barRect.left && left < barRect.right) {
            return barContainer;
        }
    }
    return null;
}

function url(href) {
    return 'url(' + href + ')';
}

function initMemoryBar() {
    var memoryBar = document.querySelector('.memoryBar');
    for (var i = 0; i < 6; i++) {
        var memoryContainer = document.createElement('div');
        memoryContainer.classList.add('memoryContainer');
        memoryContainer.setAttribute('touch-action', 'none');
        memoryBar.appendChild(memoryContainer);

        var container = new MemoryContainer(memoryContainer);
        barContainers.push(container);
    }

    overlayDiv.addEventListener('transitionend', onOverlayTransitionEnd);
}

function removeMemoryBar() {
    barContainers.forEach(function(container) {
        container.remove();
    });
    barContainers = [];

    overlayDiv.removeEventListener('transitionend', onOverlayTransitionEnd);
}

function onOverlayTransitionEnd(event) {
    if (overlayDiv.classList.contains('overlayMemory')) {
        window.location.href = 'of://createMemory';
        pocketOnMemoryCreationStart();
    }
}

function receiveThumbnail(thumbnailUrl) {
    if (overlayDiv.classList.contains('overlayMemory')) {
        overlayDiv.style.backgroundImage = url(thumbnailUrl);
        activeThumbnail = thumbnailUrl;
    }
}

function addObjectMemory(obj) {
    var freeMemory;
    if (pendingMemorizations.hasOwnProperty(obj.objectId)) {
        freeMemory = pendingMemorizations[obj.objectId];
        delete pendingMemorizations[obj.objectId];
    } else {
        freeMemory = barContainers.filter(function(container) {
            // Container either doesn't have a memory or the memory is of this object
            return !container.memory || container.memory.id === obj.objectId;
        })[0];

        if (!freeMemory) {
            console.warn('There are no free memory slots');
            return;
        }
    }

   barContainers.forEach(function(container) {
        if (container.memory && container.memory.id === obj.objectId) {
            container.clear();
        }
    });

    freeMemory.set(obj);
}

function getMemoryWithId(id) {
    for (var i = 0; i < barContainers.length; i++) {
        var barContainer = barContainers[i];
        if (barContainer.memory && barContainer.memory.id === id) {
            return barContainer;
        }
    }
    return null;
}

function memoryCanCreate() {
    // Exactly one visible object
    if (Object.keys(globalObjects).length !== 1 || typeof globalObjects.dummy !== 'undefined') {
        return false;
    }
    // User is in ui mode
    if (globalStates.guiState !== 'ui') {
        return false;
    }
    if (globalStates.freezeButtonState) {
        return false;
    }
    if (pocketShown()) {
        return false;
    }
    return true;
}

exports.initMemoryBar = initMemoryBar;
exports.removeMemoryBar = removeMemoryBar;
exports.receiveThumbnail = receiveThumbnail;
exports.addObjectMemory = addObjectMemory;
exports.MemoryContainer = MemoryContainer;
exports.getMemoryWithId = getMemoryWithId;
exports.memoryCanCreate = memoryCanCreate;

}(window));
