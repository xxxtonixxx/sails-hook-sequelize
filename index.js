module.exports = function (sails) {
  global['Sequelize'] = require('sequelize');
  Sequelize.cls = require('continuation-local-storage').createNamespace('sails-sequelize-postgresql');
  return {
    initialize: function (next) {
      var hook = this;
      hook.initAdapters();
      hook.initModels();

      var datastore, migrate, sequelize;
      sails.log.verbose('Using datastore named ' + sails.config.models.datastore);
      datastore = sails.config.datastores[sails.config.models.datastore];
      if (datastore == null) {
        throw new Error('Datastore \'' + sails.config.models.datastore + '\' not found in config/datastores');
      }
      if (datastore.options == null) {
        datastore.options = {};
      }
      datastore.options.logging = datastore.options.logging || sails.log.verbose; //A function that gets executed everytime Sequelize would log something.

      migrate = sails.config.models.migrate;
      sails.log.verbose('Migration: ' + migrate);

      if (datastore.url) {
        sequelize = new Sequelize(datastore.url, datastore.options);
      } else {
        sequelize = new Sequelize(datastore.database, datastore.user, datastore.password, datastore.options);
      }
      global['sequelize'] = sequelize;
      return sails.modules.loadModels(function (err, models) {
        var modelDef, modelName, ref;
        if (err != null) {
          return next(err);
        }
        for (modelName in models) {
          modelDef = models[modelName];
          sails.log.verbose('Loading model \'' + modelDef.globalId + '\'');

          const snakeModelName = modelDef.globalId.replace(
            /\.?([A-Z])/g,
            (_, match) => "_" + match.toLowerCase()
          ).replace(/^_/, "");

          const model = sequelize.define(snakeModelName, modelDef.attributes, modelDef.options);

          if (modelDef.classMethods && typeof modelDef.classMethods === "object") {
            Object.keys(modelDef.classMethods).forEach(methodName => {
              model[methodName] = modelDef.classMethods[methodName];
            });
          }

          if (modelDef.instanceMethods && typeof modelDef.classMethods === "object") {
            Object.keys(modelDef.instanceMethods).forEach(methodName => {
              model.prototype[methodName] = modelDef.instanceMethods[methodName];
            });
          }

          global[modelDef.globalId] = model;
          sails.models[modelDef.globalId] = global[modelDef.globalId];
        }

        for (modelName in models) {
          modelDef = models[modelName];

          hook.setAssociation(modelDef);
          hook.setDefaultScope(modelDef);
        }

        if (migrate === 'safe') {
          return next();
        } else {
          var forceSync = migrate === 'drop';
          sequelize.sync({ force: forceSync }).then(function () {
            return next();
          });
        }
      });
    },

    initAdapters: function () {
      if (sails.adapters === undefined) {
        sails.adapters = {};
      }
    },

    initModels: function () {
      if (sails.models === undefined) {
        sails.models = {};
      }
    },

    setAssociation: function (modelDef) {
      if (modelDef.associations != null) {
        sails.log.verbose('Loading associations for \'' + modelDef.globalId + '\'');
        if (typeof modelDef.associations === 'function') {
          modelDef.associations(modelDef);
        }
      }
    },

    setDefaultScope: function (modelDef) {
      if (modelDef.defaultScope != null) {
        sails.log.verbose('Loading default scope for \'' + modelDef.globalId + '\'');
        var model = global[modelDef.globalId];
        if (typeof modelDef.defaultScope === 'function') {
          var defaultScope = modelDef.defaultScope() || {};
          model.addScope('defaultScope', defaultScope, { override: true });
        }
      }
    }
  };
};
