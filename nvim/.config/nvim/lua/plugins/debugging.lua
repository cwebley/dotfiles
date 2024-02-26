return {}
--[=[
--
install vscode js debug
```
  git clone https://github.com/microsoft/vscode-js-debug ~/.DAP/vscode-js-debug --depth=1
  cd ~/.DAP/vscode-js-debug
  npm install --legacy-peer-deps
  npm run compile
```
 --]=]

--[=[
return {
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      "rcarriga/nvim-dap-ui",
    },
    config = function()
      local dap = require("dap")
      local dapui = require("dapui")

      local debugger_path = vim.fn.stdpath("data") .. "/mason/packages/js-debug-adapter"

      --			require("dap").adapters["pwa-node"] = {
      --				type = "server",
      --				host = "localhost",
      --				port = 8123,
      --				executable = {
      --					command = "js-debug-adapter",
      --					-- 💀 Make sure to update this path to point to your installation
      --					args = { debugger_path, "${port}" },
      --				},
      --			}

      for _, language in ipairs({ "typescript", "javascript" }) do
        dap.configurations[language] = {
          {
            type = "pwa-node",
            request = "launch",
            name = "Launch file",
            program = "${file}",
            cwd = "${workspaceFolder}",
          },
          --    {
          --      type = "node2",
          --      name = "Launch",
          --      request = "launch",
          --      program = "${file}",
          --      cwd = vim.fn.getcwd(),
          --      sourceMaps = true,
          --      protocol = "inspector",
          --      console = "integratedTerminal",
          --    },
          --    {
          --      type = "node2",
          --      name = "Attach",
          --      request = "attach",
          --      program = "${file}",
          --      cwd = vim.fn.getcwd(),
          --      sourceMaps = true,
          --      protocol = "inspector",
          --      console = "integratedTerminal",
          --    },
        }
      end
      dap.adapters.node2 = {
        type = "executable",
        command = "node-debug2-adapter",
        args = { vim.fn.stdpath("data") .. "/mason/packages/node-debug2-adapter/out/src/nodeDebug.js" },
      }

      dap.listeners.before.attach.dapui_config = function()
        dapui.open()
      end
      dap.listeners.before.launch.dapui_config = function()
        dapui.open()
      end
      dap.listeners.before.event_terminated.dapui_config = function()
        dapui.close()
      end
      dap.listeners.before.event_exited.dapui_config = function()
        dapui.close()
      end

      vim.keymap.set("n", "<leader>db", function()
        dap.toggle_breakpoint()
      end)
      vim.keymap.set("n", "<leader>dc", function()
        dap.continue()
      end)
    end,
  },
  {
    "jay-babu/mason-nvim-dap.nvim",
    config = function()
      require("mason-nvim-dap").setup({
        ensure_installed = {},
      })
    end,
  },

  {
    "mxsdev/nvim-dap-vscode-js",
    config = function()
      require("dap-vscode-js").setup({
        -- node_path = "node", -- Path of node executable. Defaults to $NODE_PATH, and then "node"
        debugger_path = os.getenv("HOME") .. "/.DAP/vscode-js-debug",
        -- debugger_cmd = { "extension" }, -- Command to use to launch the debug server. Takes precedence over `node_path` and `debugger_path`.
        adapters = {
          "pwa-node",
          "pwa-chrome",
          "pwa-msedge",
          "node-terminal",
          "pwa-extensionHost",
        }, -- which adapters to register in nvim-dap
        -- log_file_path = "(stdpath cache)/dap_vscode_js.log" -- Path for file logging
        -- log_file_level = false -- Logging level for output to file. Set to false to disable file logging.
        -- log_console_level = vim.log.levels.ERROR -- Logging level for output to console. Set to false to disable console output.
      })
    end,
  },
}

 --]=]
